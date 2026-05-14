#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SttProvider {
    Local,
    AssemblyAi,
}

impl SttProvider {
    pub fn from_model(model: Option<&str>) -> Self {
        match model {
            Some(model) if model.starts_with("assemblyai-") => Self::AssemblyAi,
            _ => Self::Local,
        }
    }

    pub fn is_cloud(self) -> bool {
        match self {
            Self::Local => false,
            Self::AssemblyAi => true,
        }
    }

    pub fn is_local(self) -> bool {
        self == Self::Local
    }

    pub fn is_assemblyai(self) -> bool {
        self == Self::AssemblyAi
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Local => "local",
            Self::AssemblyAi => "assemblyai",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::SttProvider;

    #[test]
    fn detects_assemblyai_models() {
        assert_eq!(
            SttProvider::from_model(Some("assemblyai-universal")),
            SttProvider::AssemblyAi
        );
    }

    #[test]
    fn unknown_and_empty_models_are_local() {
        assert_eq!(SttProvider::from_model(None), SttProvider::Local);
        assert_eq!(SttProvider::from_model(Some("")), SttProvider::Local);
        assert_eq!(
            SttProvider::from_model(Some("QuantizedLargeTurbo")),
            SttProvider::Local
        );
    }
}
