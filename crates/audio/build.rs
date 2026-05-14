fn main() {
    let target_arch = std::env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_default();

    #[cfg(target_os = "macos")]
    {
        // ScreenCaptureKit only on Apple Silicon (aarch64)
        // Intel Macs (x86_64) use CoreAudio fallback due to cross-compilation issues
        if target_arch == "aarch64" {
            println!("cargo:rustc-link-lib=framework=ScreenCaptureKit");
            println!("cargo:rustc-link-lib=framework=CoreMedia");
            println!("cargo:rustc-link-lib=framework=CoreVideo");
        }

        // Only rerun if this build script changes
        println!("cargo:rerun-if-changed=build.rs");
    }
}
