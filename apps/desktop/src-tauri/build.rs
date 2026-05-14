fn main() {
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap();
    let target_arch = std::env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_default();
    let profile = std::env::var("PROFILE").unwrap_or_else(|_| "debug".to_string());

    match target_os.as_str() {
        "macos" => {
            // ScreenCaptureKit only on Apple Silicon (aarch64)
            // Intel Macs (x86_64) use CoreAudio fallback due to cross-compilation issues
            if target_arch == "aarch64" {
                println!("cargo:rustc-link-lib=framework=ScreenCaptureKit");
                println!("cargo:rustc-link-lib=framework=CoreMedia");
                println!("cargo:rustc-link-lib=framework=CoreVideo");
            }

            if profile == "release" {
                println!("cargo:rustc-cfg=feature=\"macos-default\"");
            } else {
                // Enable lighter features for development to avoid ARM compilation issues
                println!("cargo:rustc-cfg=feature=\"stt-coreml\"");
                println!("cargo:rustc-cfg=feature=\"llm-metal\"");
            }
        }
        "windows" => {
            if profile == "release" {
                println!("cargo:rustc-cfg=feature=\"windows-default\"");
            } else {
                // Enable lighter features for development
                println!("cargo:rustc-cfg=feature=\"stt-openblas\"");
                println!("cargo:rustc-cfg=feature=\"llm-vulkan\"");
            }
        }
        _ => {}
    }

    tauri_build::build()
}
