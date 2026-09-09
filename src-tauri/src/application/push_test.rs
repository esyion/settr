//! run_push_loop 完整循环与 PushCoordinator 的单元测试(由 push.rs 的
//! `#[cfg(test)] mod push_test;` 显式引入编译)。

use super::{
    run_push_loop, PushCoordinator, PushEvent, PushEventSink, PushSpec, PushStream,
    PushStreamFactory,
};
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use tokio::sync::watch;

/// fake 工厂按脚本依次返回响应;脚本耗尽后 panic(防止测试失控重连)。
struct ScriptedFactory {
    responses: Mutex<Vec<Result<PushStream, String>>>,
}

impl PushStreamFactory for ScriptedFactory {
    fn open(
        &self,
        _spec: &PushSpec,
    ) -> Pin<Box<dyn Future<Output = Result<PushStream, String>> + Send + '_>> {
        Box::pin(async {
            self.responses
                .lock()
                .expect("script lock")
                .pop()
                .expect("脚本耗尽:循环重连次数超出预期")
        })
    }
}

/// 把文本切成单字节块,验证解析器对分片到达的容忍。
fn stream_from_text(text: &str) -> PushStream {
    let chunks: Vec<Result<Vec<u8>, String>> = text.bytes().map(|b| Ok(vec![b])).collect();
    PushStream {
        status: 200,
        chunks: Box::pin(futures_util::stream::iter(chunks)),
    }
}

/// 记录全部事件的 sink。
#[derive(Default)]
struct RecordingSink {
    events: Mutex<Vec<PushEvent>>,
}

impl PushEventSink for RecordingSink {
    fn emit(&self, event: PushEvent) {
        self.events.lock().expect("sink lock").push(event);
    }
}

fn spec() -> PushSpec {
    PushSpec {
        base_url: "http://127.0.0.1:9".to_string(),
        access_token: "token".to_string(),
        organization_id: "1".to_string(),
    }
}

/// 完整循环:连接成功 → 逐字节分片的 org-change 帧解析为变更信号 →
/// 流结束退避重连 → 第二次连接 401 → 循环以 Unauthorized 终止,且退出回调触发。
#[tokio::test]
async fn loop_parses_frames_then_stops_on_unauthorized() {
    let init = "event: init\ndata: {\"organizationId\":\"1\",\"changeId\":\"0\"}\n\n";
    let change = "event: org-change\ndata: {\"organizationId\":\"1\",\
        \"changeType\":\"POLICY\",\"changeId\":\"42\"}\n\n:hb\n\n";
    let factory = Arc::new(ScriptedFactory {
        responses: Mutex::new(vec![
            Ok(PushStream {
                status: 401,
                chunks: Box::pin(futures_util::stream::iter(vec![])),
            }),
            Ok(stream_from_text(&format!("{init}{change}"))),
        ]),
    });
    let sink = Arc::new(RecordingSink::default());
    let (stop_sender, stop_receiver) = watch::channel(false);
    let finished = Arc::new(Mutex::new(false));
    let finished_hook = finished.clone();
    let on_finish: super::PushLoopFinishHook = Arc::new(move || {
        *finished_hook.lock().expect("finish lock") = true;
    });

    run_push_loop(spec(), stop_receiver, factory, sink.clone(), on_finish).await;

    let events = sink.events.lock().expect("sink lock").clone();
    assert!(events.contains(&PushEvent::Connected));
    assert!(events.contains(&PushEvent::Change {
        organization_id: "1".to_string(),
        change_type: "POLICY".to_string(),
        change_id: "42".to_string(),
    }));
    assert_eq!(events.last(), Some(&PushEvent::Unauthorized));
    assert!(*finished.lock().expect("finish lock"));
    let _ = stop_sender.send(true);
}

/// 停止信号在退避等待期间触发时,循环立即退出并触发退出回调。
#[tokio::test]
async fn stop_during_backoff_exits_loop() {
    let factory = Arc::new(ScriptedFactory {
        responses: Mutex::new(vec![Err("network unreachable".to_string())]),
    });
    let sink = Arc::new(RecordingSink::default());
    let (stop_sender, stop_receiver) = watch::channel(false);
    let finished = Arc::new(Mutex::new(false));
    let finished_hook = finished.clone();
    let on_finish: super::PushLoopFinishHook = Arc::new(move || {
        *finished_hook.lock().expect("finish lock") = true;
    });

    let task = tokio::spawn(run_push_loop(
        spec(),
        stop_receiver,
        factory,
        sink.clone(),
        on_finish,
    ));
    // 断连事件(首次 open 失败)出现后再停止,确保停在了退避睡眠段。
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        loop {
            if sink
                .events
                .lock()
                .expect("sink lock")
                .contains(&PushEvent::Disconnected)
            {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("未观察到首次断连事件");
    let _ = stop_sender.send(true);

    tokio::time::timeout(std::time::Duration::from_secs(2), task)
        .await
        .expect("循环未在停止后退出的重连")
        .expect("循环任务 panic");
    assert!(*finished.lock().expect("finish lock"));
}

/// 协调器:激活替换旧连接(旧停止信号置位),stop_active 幂等,
/// deactivate_if_current 只解除自己的登记。
#[tokio::test]
async fn coordinator_replaces_and_stops() {
    let coordinator = PushCoordinator::default();
    let (first_stop, mut first_receiver) = watch::channel(false);
    let first_generation = coordinator.activate(first_stop);
    assert!(coordinator.has_active());

    let (second_stop, _second_receiver) = watch::channel(false);
    let second_generation = coordinator.activate(second_stop);
    assert!(*first_receiver.borrow_and_update());
    assert_ne!(first_generation, second_generation);

    // 旧代际的退出回调不得解除新连接的登记。
    coordinator.deactivate_if_current(first_generation);
    assert!(coordinator.has_active());
    assert_eq!(coordinator.current_generation(), Some(second_generation));

    coordinator.deactivate_if_current(second_generation);
    assert!(!coordinator.has_active());
    coordinator.stop_active();
}
