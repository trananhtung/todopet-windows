//! A small call limiter: a minimum gap between calls plus a cap per rolling window. Used for "Ask
//! Claude", which spends the user's Anthropic credit, so a bug in the page (or a stuck button) cannot
//! fire requests in a loop.

use std::collections::VecDeque;

#[derive(Debug, Clone)]
pub struct RateLimiter {
    min_gap_ms: u64,
    window_ms: u64,
    max_in_window: usize,
    /// Times (ms, monotonic) of the calls let through inside the current window, oldest first.
    calls: VecDeque<u64>,
}

impl RateLimiter {
    pub fn new(min_gap_ms: u64, window_ms: u64, max_in_window: usize) -> Self {
        Self { min_gap_ms, window_ms, max_in_window, calls: VecDeque::new() }
    }

    /// The "Ask Claude" policy: at least 5 s between requests and at most 20 per rolling hour.
    pub fn claude() -> Self {
        Self::new(5_000, 60 * 60 * 1000, 20)
    }

    /// Records a call at `now_ms` (a monotonic clock) if it is allowed. Otherwise returns how many
    /// milliseconds to wait before the next call would be allowed, and records nothing.
    pub fn try_acquire(&mut self, now_ms: u64) -> Result<(), u64> {
        while self.calls.front().is_some_and(|&t| now_ms.saturating_sub(t) >= self.window_ms) {
            self.calls.pop_front();
        }
        let gap_wait = self.calls.back().map_or(0, |&last| (last + self.min_gap_ms).saturating_sub(now_ms));
        let window_wait = if self.calls.len() >= self.max_in_window {
            self.calls.front().map_or(0, |&oldest| (oldest + self.window_ms).saturating_sub(now_ms))
        } else {
            0
        };
        let wait = gap_wait.max(window_wait);
        if wait > 0 {
            return Err(wait);
        }
        self.calls.push_back(now_ms);
        Ok(())
    }
}

/// "Try again in 5 s", "… in 12 min": the wait rounded up, for error messages.
pub fn describe_wait(wait_ms: u64) -> String {
    let secs = wait_ms.div_ceil(1000).max(1);
    if secs < 60 {
        format!("{secs} s")
    } else {
        format!("{} min", secs.div_ceil(60))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enforces_the_minimum_gap() {
        let mut limiter = RateLimiter::new(5_000, 3_600_000, 20);
        assert_eq!(limiter.try_acquire(1_000), Ok(()));
        assert_eq!(limiter.try_acquire(2_000), Err(4_000));
        assert_eq!(limiter.try_acquire(5_999), Err(1));
        // Refused calls are not recorded, so they do not push the next allowed time back.
        assert_eq!(limiter.try_acquire(6_000), Ok(()));
    }

    #[test]
    fn caps_calls_per_rolling_window() {
        let mut limiter = RateLimiter::claude();
        let start = 10_000;
        for i in 0..20 {
            assert_eq!(limiter.try_acquire(start + i * 5_000), Ok(()), "call {i}");
        }
        let after_burst = start + 20 * 5_000;
        // The 21st waits until the first call leaves the hour.
        assert_eq!(limiter.try_acquire(after_burst), Err(start + 3_600_000 - after_burst));
        assert_eq!(limiter.try_acquire(start + 3_600_000), Ok(()));
        // The window rolls: the next slot frees when the second call is an hour old.
        assert_eq!(limiter.try_acquire(start + 3_600_000 + 5_000), Ok(()));
        assert!(limiter.try_acquire(start + 3_600_000 + 10_000 - 1).is_err());
    }

    #[test]
    fn first_call_is_always_allowed() {
        assert_eq!(RateLimiter::claude().try_acquire(0), Ok(()));
    }

    #[test]
    fn waits_are_described_rounded_up() {
        assert_eq!(describe_wait(1), "1 s");
        assert_eq!(describe_wait(4_001), "5 s");
        assert_eq!(describe_wait(59_000), "59 s");
        assert_eq!(describe_wait(60_000), "1 min");
        assert_eq!(describe_wait(61_000), "2 min");
        assert_eq!(describe_wait(3_000_000), "50 min");
    }
}
