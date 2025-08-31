use std::{env, fs, path::PathBuf};

fn ensure_icon() {
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let icons_dir = PathBuf::from(&manifest_dir).join("icons");
    let icon_path = icons_dir.join("icon.png");
    // If an icon already exists, do not touch it (avoid dev boot loops)
    if icon_path.exists() {
        return;
    }
    let _ = fs::create_dir_all(&icons_dir);
    // Generate a valid 1x1 RGBA PNG
    let file = fs::File::create(&icon_path).expect("create icon.png");
    let w = std::io::BufWriter::new(file);
    let mut encoder = png::Encoder::new(w, 1, 1);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().expect("png header");
    let data = [0u8, 0u8, 0u8, 0u8]; // transparent
    writer.write_image_data(&data).expect("png data");
}

fn main() {
    ensure_icon();
    tauri_build::build()
}
