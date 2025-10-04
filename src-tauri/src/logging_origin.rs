use std::{cell::RefCell, future::Future};

tokio::task_local! {
    static REQUEST_ORIGIN: RefCell<Option<String>>;
}

/// Execute `f` with the given origin bound for downstream logging interceptors.
pub async fn with_request_origin<F, Fut, T>(origin: impl Into<String>, f: F) -> T
where
    F: FnOnce() -> Fut,
    Fut: Future<Output = T>,
{
    let origin = origin.into();
    REQUEST_ORIGIN
        .scope(RefCell::new(Some(origin)), async move { f().await })
        .await
}

/// Execute `f` with an optional origin. When `origin` is `None`, the previous
/// scope (if any) is cleared for the duration of `f`.
pub async fn with_optional_request_origin<F, Fut, T>(origin: Option<String>, f: F) -> T
where
    F: FnOnce() -> Fut,
    Fut: Future<Output = T>,
{
    REQUEST_ORIGIN
        .scope(RefCell::new(origin), async move { f().await })
        .await
}

/// Inspect the current request origin (if one has been set on this task).
pub fn current_request_origin() -> Option<String> {
    REQUEST_ORIGIN
        .try_with(|cell| cell.borrow().clone())
        .ok()
        .flatten()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn scopes_override_and_restore() {
        assert!(current_request_origin().is_none());
        let outer = with_request_origin("outer", || async {
            assert_eq!(current_request_origin().as_deref(), Some("outer"));
            with_request_origin("inner", || async {
                assert_eq!(current_request_origin().as_deref(), Some("inner"));
            })
            .await;
            assert_eq!(current_request_origin().as_deref(), Some("outer"));
        });
        outer.await;
        assert!(current_request_origin().is_none());
    }

    #[tokio::test]
    async fn optional_scope_clears_origin() {
        with_request_origin("outer", || async {
            assert_eq!(current_request_origin().as_deref(), Some("outer"));
            with_optional_request_origin(None, || async {
                assert!(current_request_origin().is_none());
            })
            .await;
            assert_eq!(current_request_origin().as_deref(), Some("outer"));
        })
        .await;
    }
}
