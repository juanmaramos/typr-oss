use std::{io, path::PathBuf, process::ExitCode};

fn main() -> ExitCode {
    let mut args = std::env::args_os().skip(1);
    let library = match (args.next(), args.next(), args.next()) {
        (Some(flag), Some(path), None) if flag == "--sdk-library" => PathBuf::from(path),
        _ => {
            eprintln!("usage: typr-nemotron-worker --sdk-library ABSOLUTE_PATH");
            return ExitCode::FAILURE;
        }
    };
    let result = typr_nemotron_runtime::worker::run(
        &mut io::stdin().lock(),
        &mut io::stdout().lock(),
        &library,
    );
    if result.is_ok() {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}
