fn main() {
    let crate_dir =
        std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let config =
        cbindgen::Config::from_file(crate_dir.join("cbindgen.toml")).expect("load cbindgen.toml");

    std::fs::create_dir_all(crate_dir.join("include")).expect("create include/");

    cbindgen::generate_with_config(&crate_dir, config)
        .expect("generate C header")
        .write_to_file(crate_dir.join("include/blackbox.h"));
}
