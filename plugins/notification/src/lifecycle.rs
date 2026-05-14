use std::time::{Duration, Instant};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SessionState {
    Inactive,
    RunningActive,
    RunningPaused,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Input {
    MeetingSignal,
    AudioSignal,
    SessionStateChanged(SessionState),
    Tick,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Action {
    StartAutoSession,
    PauseAutoSession,
    ResumeAutoSession,
    StopAutoSession,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct Policy {
    pub(crate) meeting_presence_ttl: Duration,
    pub(crate) audio_grace_window: Duration,
    pub(crate) pause_after_silence: Duration,
    pub(crate) stop_after_pause_silence: Duration,
    pub(crate) restart_cooldown: Duration,
}

impl Default for Policy {
    fn default() -> Self {
        Self {
            // App/browser detectors are not continuous on all platforms, so we keep this generous.
            meeting_presence_ttl: Duration::from_secs(3 * 60 * 60),
            // Audio signal freshness window.
            audio_grace_window: Duration::from_secs(45),
            // Pause quickly when there's no meeting audio.
            pause_after_silence: Duration::from_secs(2 * 60),
            // If still no audio while paused, end the auto-managed session.
            stop_after_pause_silence: Duration::from_secs(6 * 60),
            // Prevent rapid restart loops after an auto-stop.
            restart_cooldown: Duration::from_secs(3 * 60),
        }
    }
}

#[derive(Debug)]
pub(crate) struct Controller {
    policy: Policy,
    pub(crate) session_state: SessionState,
    auto_session_active: bool,
    last_meeting_signal_at: Option<Instant>,
    last_audio_signal_at: Option<Instant>,
    last_auto_stop_at: Option<Instant>,
}

impl Default for Controller {
    fn default() -> Self {
        Self {
            policy: Policy::default(),
            session_state: SessionState::Inactive,
            auto_session_active: false,
            last_meeting_signal_at: None,
            last_audio_signal_at: None,
            last_auto_stop_at: None,
        }
    }
}

impl Controller {
    #[cfg(test)]
    fn with_policy(policy: Policy) -> Self {
        Self {
            policy,
            ..Self::default()
        }
    }

    pub(crate) fn on_input(&mut self, input: Input, now: Instant) -> Option<Action> {
        match input {
            Input::MeetingSignal => {
                self.last_meeting_signal_at = Some(now);
            }
            Input::AudioSignal => {
                self.last_audio_signal_at = Some(now);
            }
            Input::SessionStateChanged(state) => {
                self.session_state = state;
                if state == SessionState::Inactive && self.auto_session_active {
                    self.auto_session_active = false;
                    self.last_auto_stop_at = Some(now);
                }
            }
            Input::Tick => {}
        }

        self.decide(now)
    }

    pub(crate) fn mark_auto_session_started(&mut self, now: Instant) {
        self.auto_session_active = true;
        self.last_audio_signal_at = Some(now);
    }

    pub(crate) fn mark_auto_session_start_failed(&mut self, now: Instant) {
        self.auto_session_active = false;
        self.last_auto_stop_at = Some(now);
    }

    pub(crate) fn mark_auto_session_stopped(&mut self, now: Instant) {
        self.auto_session_active = false;
        self.last_auto_stop_at = Some(now);
        self.last_audio_signal_at = None;
        self.last_meeting_signal_at = None;
    }

    fn decide(&mut self, now: Instant) -> Option<Action> {
        if self.auto_session_active {
            return self.decide_for_active_auto_session(now);
        }

        if self.session_state != SessionState::Inactive {
            return None;
        }

        if !self.has_recent_meeting_signal(now)
            || !self.has_recent_audio_signal(now)
            || !self.cooldown_elapsed(now)
        {
            return None;
        }

        // Optimistically lock so repeated ticks do not emit repeated start actions.
        self.auto_session_active = true;
        Some(Action::StartAutoSession)
    }

    fn decide_for_active_auto_session(&mut self, now: Instant) -> Option<Action> {
        match self.session_state {
            SessionState::Inactive => None,
            SessionState::RunningActive => {
                if self.inactive_for(now) >= self.policy.pause_after_silence {
                    Some(Action::PauseAutoSession)
                } else {
                    None
                }
            }
            SessionState::RunningPaused => {
                if self.has_recent_meeting_signal(now) && self.has_recent_audio_signal(now) {
                    return Some(Action::ResumeAutoSession);
                }

                if self.inactive_for(now) >= self.policy.stop_after_pause_silence {
                    return Some(Action::StopAutoSession);
                }

                None
            }
        }
    }

    fn has_recent_meeting_signal(&self, now: Instant) -> bool {
        self.last_meeting_signal_at
            .is_some_and(|t| now.duration_since(t) <= self.policy.meeting_presence_ttl)
    }

    fn has_recent_audio_signal(&self, now: Instant) -> bool {
        self.last_audio_signal_at
            .is_some_and(|t| now.duration_since(t) <= self.policy.audio_grace_window)
    }

    fn inactivity_anchor(&self) -> Option<Instant> {
        match (self.last_audio_signal_at, self.last_meeting_signal_at) {
            (Some(audio), Some(meeting)) => Some(std::cmp::max(audio, meeting)),
            (Some(audio), None) => Some(audio),
            (None, Some(meeting)) => Some(meeting),
            (None, None) => None,
        }
    }

    fn inactive_for(&self, now: Instant) -> Duration {
        self.inactivity_anchor()
            .map(|t| now.duration_since(t))
            .unwrap_or(Duration::MAX)
    }

    fn cooldown_elapsed(&self, now: Instant) -> bool {
        self.last_auto_stop_at
            .is_none_or(|t| now.duration_since(t) >= self.policy.restart_cooldown)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_policy() -> Policy {
        Policy {
            meeting_presence_ttl: Duration::from_secs(120),
            audio_grace_window: Duration::from_secs(5),
            pause_after_silence: Duration::from_secs(20),
            stop_after_pause_silence: Duration::from_secs(40),
            restart_cooldown: Duration::from_secs(30),
        }
    }

    #[test]
    fn starts_when_meeting_signal_arrives_and_session_is_inactive() {
        let mut controller = Controller::with_policy(test_policy());
        let now = Instant::now();

        controller.on_input(Input::SessionStateChanged(SessionState::Inactive), now);
        controller.on_input(Input::AudioSignal, now);
        let action = controller.on_input(Input::MeetingSignal, now);

        assert_eq!(action, Some(Action::StartAutoSession));
    }

    #[test]
    fn does_not_start_without_recent_audio_signal() {
        let mut controller = Controller::with_policy(test_policy());
        let now = Instant::now();

        controller.on_input(Input::SessionStateChanged(SessionState::Inactive), now);
        let action = controller.on_input(Input::MeetingSignal, now);

        assert_eq!(action, None);
    }

    #[test]
    fn pauses_when_active_and_no_audio_for_threshold() {
        let mut controller = Controller::with_policy(test_policy());
        let now = Instant::now();

        controller.mark_auto_session_started(now);
        controller.on_input(Input::SessionStateChanged(SessionState::RunningActive), now);
        controller.on_input(Input::MeetingSignal, now);
        controller.on_input(Input::AudioSignal, now);

        let action = controller.on_input(Input::Tick, now + Duration::from_secs(25));
        assert_eq!(action, Some(Action::PauseAutoSession));
    }

    #[test]
    fn resumes_when_paused_and_audio_returns_with_recent_meeting_signal() {
        let mut controller = Controller::with_policy(test_policy());
        let now = Instant::now();

        controller.mark_auto_session_started(now);
        controller.on_input(Input::SessionStateChanged(SessionState::RunningPaused), now);
        controller.on_input(Input::MeetingSignal, now);
        controller.on_input(Input::AudioSignal, now + Duration::from_secs(2));

        let action = controller.on_input(Input::Tick, now + Duration::from_secs(3));
        assert_eq!(action, Some(Action::ResumeAutoSession));
    }

    #[test]
    fn stops_when_paused_and_inactivity_exceeds_stop_threshold() {
        let mut controller = Controller::with_policy(test_policy());
        let now = Instant::now();

        controller.mark_auto_session_started(now);
        controller.on_input(Input::SessionStateChanged(SessionState::RunningPaused), now);
        controller.on_input(Input::MeetingSignal, now);
        controller.on_input(Input::AudioSignal, now);

        let action = controller.on_input(Input::Tick, now + Duration::from_secs(45));
        assert_eq!(action, Some(Action::StopAutoSession));
    }

    #[test]
    fn uses_latest_signal_as_inactivity_anchor() {
        let mut controller = Controller::with_policy(test_policy());
        let now = Instant::now();

        controller.mark_auto_session_started(now);
        controller.on_input(Input::SessionStateChanged(SessionState::RunningActive), now);
        controller.on_input(Input::AudioSignal, now);
        controller.on_input(Input::MeetingSignal, now + Duration::from_secs(15));

        // Pause threshold is 20s; since the meeting signal is newer,
        // inactivity is only 16s at this tick and should not pause yet.
        let action = controller.on_input(Input::Tick, now + Duration::from_secs(31));
        assert_eq!(action, None);
    }

    #[test]
    fn respects_restart_cooldown_after_stop() {
        let mut controller = Controller::with_policy(test_policy());
        let now = Instant::now();

        controller.mark_auto_session_stopped(now);
        controller.on_input(Input::AudioSignal, now + Duration::from_secs(1));
        let immediate = controller.on_input(Input::MeetingSignal, now + Duration::from_secs(1));
        assert_eq!(immediate, None);

        controller.on_input(Input::MeetingSignal, now + Duration::from_secs(31));
        let after_cooldown = controller.on_input(Input::AudioSignal, now + Duration::from_secs(31));
        assert_eq!(after_cooldown, Some(Action::StartAutoSession));
    }
}
