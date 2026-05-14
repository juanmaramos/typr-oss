use std::time::Duration;

pub(crate) const DEFAULT_INACTIVITY_STOP_AFTER_MS: u32 = 20 * 60 * 1000;
pub(crate) const DEFAULT_INACTIVITY_WARNING_BEFORE_MS: u32 = 2 * 60 * 1000;
pub(crate) const DEFAULT_MAX_SESSION_DURATION_MS: u32 = 8 * 60 * 60 * 1000;
pub(crate) const DEFAULT_MAX_SESSION_WARNING_BEFORE_MS: u32 = 5 * 60 * 1000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum AutoStopReason {
    Inactivity,
    MaxSessionDuration,
}

impl AutoStopReason {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            AutoStopReason::Inactivity => "inactivity",
            AutoStopReason::MaxSessionDuration => "max_session_duration",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum WatchdogAction {
    Warning {
        reason: AutoStopReason,
        remaining: Duration,
    },
    Stop {
        reason: AutoStopReason,
    },
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct SessionLifecyclePolicy {
    pub(crate) inactivity_stop_after: Duration,
    pub(crate) inactivity_warning_before: Duration,
    pub(crate) max_session_duration: Duration,
    pub(crate) max_session_warning_before: Duration,
}

impl Default for SessionLifecyclePolicy {
    fn default() -> Self {
        Self {
            inactivity_stop_after: Duration::from_millis(u64::from(
                DEFAULT_INACTIVITY_STOP_AFTER_MS,
            )),
            inactivity_warning_before: Duration::from_millis(u64::from(
                DEFAULT_INACTIVITY_WARNING_BEFORE_MS,
            )),
            max_session_duration: Duration::from_millis(u64::from(DEFAULT_MAX_SESSION_DURATION_MS)),
            max_session_warning_before: Duration::from_millis(u64::from(
                DEFAULT_MAX_SESSION_WARNING_BEFORE_MS,
            )),
        }
    }
}

impl SessionLifecyclePolicy {
    pub(crate) fn from_config_values(
        inactivity_stop_after_ms: Option<u32>,
        inactivity_warning_before_ms: Option<u32>,
        max_session_duration_ms: Option<u32>,
        max_session_warning_before_ms: Option<u32>,
    ) -> Self {
        let defaults = Self::default();

        let inactivity_stop_after =
            duration_from_ms(inactivity_stop_after_ms, defaults.inactivity_stop_after);
        let max_session_duration =
            duration_from_ms(max_session_duration_ms, defaults.max_session_duration);

        let inactivity_warning_before = clamp_warning_before(
            duration_from_ms(
                inactivity_warning_before_ms,
                defaults.inactivity_warning_before,
            ),
            inactivity_stop_after,
        );

        let max_session_warning_before = clamp_warning_before(
            duration_from_ms(
                max_session_warning_before_ms,
                defaults.max_session_warning_before,
            ),
            max_session_duration,
        );

        Self {
            inactivity_stop_after,
            inactivity_warning_before,
            max_session_duration,
            max_session_warning_before,
        }
    }
}

fn duration_from_ms(value: Option<u32>, fallback: Duration) -> Duration {
    value
        .filter(|ms| *ms > 0)
        .map(|ms| Duration::from_millis(u64::from(ms)))
        .unwrap_or(fallback)
}

fn clamp_warning_before(candidate: Duration, stop_after: Duration) -> Duration {
    let min_gap = Duration::from_secs(1);
    if stop_after <= min_gap {
        return Duration::from_secs(0);
    }

    let max_warning = stop_after.saturating_sub(min_gap);
    if candidate > max_warning {
        max_warning
    } else {
        candidate
    }
}

#[derive(Debug, Default)]
pub(crate) struct SessionWatchdog {
    inactivity_warning_emitted: bool,
    max_duration_warning_emitted: bool,
}

impl SessionWatchdog {
    pub(crate) fn evaluate(
        &mut self,
        policy: &SessionLifecyclePolicy,
        session_elapsed: Duration,
        silence_elapsed: Duration,
        is_running_active: bool,
    ) -> Option<WatchdogAction> {
        if !is_running_active {
            return None;
        }

        if session_elapsed >= policy.max_session_duration {
            return Some(WatchdogAction::Stop {
                reason: AutoStopReason::MaxSessionDuration,
            });
        }

        let max_warn_threshold = policy
            .max_session_duration
            .saturating_sub(policy.max_session_warning_before);
        if !self.max_duration_warning_emitted && session_elapsed >= max_warn_threshold {
            self.max_duration_warning_emitted = true;
            return Some(WatchdogAction::Warning {
                reason: AutoStopReason::MaxSessionDuration,
                remaining: policy.max_session_duration.saturating_sub(session_elapsed),
            });
        }

        if silence_elapsed >= policy.inactivity_stop_after {
            return Some(WatchdogAction::Stop {
                reason: AutoStopReason::Inactivity,
            });
        }

        let inactivity_warn_threshold = policy
            .inactivity_stop_after
            .saturating_sub(policy.inactivity_warning_before);

        // Clear warning if activity resumed to avoid stale state.
        if silence_elapsed < inactivity_warn_threshold {
            self.inactivity_warning_emitted = false;
            return None;
        }

        if !self.inactivity_warning_emitted {
            self.inactivity_warning_emitted = true;
            return Some(WatchdogAction::Warning {
                reason: AutoStopReason::Inactivity,
                remaining: policy.inactivity_stop_after.saturating_sub(silence_elapsed),
            });
        }

        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_policy() -> SessionLifecyclePolicy {
        SessionLifecyclePolicy {
            inactivity_stop_after: Duration::from_secs(100),
            inactivity_warning_before: Duration::from_secs(20),
            max_session_duration: Duration::from_secs(300),
            max_session_warning_before: Duration::from_secs(30),
        }
    }

    #[test]
    fn emits_inactivity_warning_once_before_stop() {
        let mut watchdog = SessionWatchdog::default();
        let policy = test_policy();

        let warning = watchdog.evaluate(
            &policy,
            Duration::from_secs(10),
            Duration::from_secs(80),
            true,
        );
        assert_eq!(
            warning,
            Some(WatchdogAction::Warning {
                reason: AutoStopReason::Inactivity,
                remaining: Duration::from_secs(20),
            })
        );

        let no_duplicate_warning = watchdog.evaluate(
            &policy,
            Duration::from_secs(20),
            Duration::from_secs(90),
            true,
        );
        assert_eq!(no_duplicate_warning, None);

        let stop = watchdog.evaluate(
            &policy,
            Duration::from_secs(30),
            Duration::from_secs(100),
            true,
        );
        assert_eq!(
            stop,
            Some(WatchdogAction::Stop {
                reason: AutoStopReason::Inactivity,
            })
        );
    }

    #[test]
    fn resets_inactivity_warning_after_activity() {
        let mut watchdog = SessionWatchdog::default();
        let policy = test_policy();

        let _ = watchdog.evaluate(
            &policy,
            Duration::from_secs(10),
            Duration::from_secs(80),
            true,
        );
        let resumed_activity = watchdog.evaluate(
            &policy,
            Duration::from_secs(12),
            Duration::from_secs(10),
            true,
        );
        assert_eq!(resumed_activity, None);

        let warning_again = watchdog.evaluate(
            &policy,
            Duration::from_secs(20),
            Duration::from_secs(81),
            true,
        );
        assert_eq!(
            warning_again,
            Some(WatchdogAction::Warning {
                reason: AutoStopReason::Inactivity,
                remaining: Duration::from_secs(19),
            })
        );
    }

    #[test]
    fn warns_and_stops_on_max_duration() {
        let mut watchdog = SessionWatchdog::default();
        let policy = test_policy();

        let warning = watchdog.evaluate(
            &policy,
            Duration::from_secs(270),
            Duration::from_secs(1),
            true,
        );
        assert_eq!(
            warning,
            Some(WatchdogAction::Warning {
                reason: AutoStopReason::MaxSessionDuration,
                remaining: Duration::from_secs(30),
            })
        );

        let stop = watchdog.evaluate(
            &policy,
            Duration::from_secs(300),
            Duration::from_secs(1),
            true,
        );
        assert_eq!(
            stop,
            Some(WatchdogAction::Stop {
                reason: AutoStopReason::MaxSessionDuration,
            })
        );
    }

    #[test]
    fn does_not_trigger_when_not_running_active() {
        let mut watchdog = SessionWatchdog::default();
        let policy = test_policy();

        let action = watchdog.evaluate(
            &policy,
            Duration::from_secs(500),
            Duration::from_secs(500),
            false,
        );
        assert_eq!(action, None);
    }

    #[test]
    fn uses_defaults_for_invalid_or_missing_values() {
        let policy = SessionLifecyclePolicy::from_config_values(Some(0), None, None, Some(0));
        let defaults = SessionLifecyclePolicy::default();

        assert_eq!(policy.inactivity_stop_after, defaults.inactivity_stop_after);
        assert_eq!(
            policy.inactivity_warning_before,
            defaults.inactivity_warning_before
        );
        assert_eq!(policy.max_session_duration, defaults.max_session_duration);
        assert_eq!(
            policy.max_session_warning_before,
            defaults.max_session_warning_before
        );
    }

    #[test]
    fn clamps_warning_to_be_less_than_stop_threshold() {
        let policy = SessionLifecyclePolicy::from_config_values(
            Some(30_000),
            Some(45_000),
            Some(120_000),
            Some(120_000),
        );

        assert_eq!(policy.inactivity_stop_after, Duration::from_secs(30));
        assert_eq!(policy.inactivity_warning_before, Duration::from_secs(29));
        assert_eq!(policy.max_session_duration, Duration::from_secs(120));
        assert_eq!(policy.max_session_warning_before, Duration::from_secs(119));
    }
}
