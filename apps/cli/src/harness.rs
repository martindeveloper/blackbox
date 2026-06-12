use std::collections::HashMap;

use blackbox::content::NodeMode;
use blackbox::{DynamicValue, GameView, MusicCue, RollRecord, SfxCue};

pub fn format_mode(mode: &NodeMode) -> &'static str {
    match mode {
        NodeMode::Normal => "normal",
        NodeMode::GameOver => "game_over",
        NodeMode::Ending => "ending",
    }
}

pub fn print_sorted_i32_map(map: &HashMap<String, i32, impl std::hash::BuildHasher>) {
    if map.is_empty() {
        println!("  (empty)");
        return;
    }

    let mut entries: Vec<_> = map.iter().collect();
    entries.sort_by_key(|(key, _)| key.as_str());

    for (key, value) in entries {
        println!("  {key}: {value}");
    }
}

pub fn print_sorted_u32_map(map: &HashMap<String, u32, impl std::hash::BuildHasher>) {
    if map.is_empty() {
        println!("  (empty)");
        return;
    }

    let mut entries: Vec<_> = map.iter().collect();
    entries.sort_by_key(|(key, _)| key.as_str());

    for (key, value) in entries {
        println!("  {key}: {value}");
    }
}

pub fn print_flags(flags: &HashMap<String, DynamicValue, impl std::hash::BuildHasher>) {
    if flags.is_empty() {
        println!("  (empty)");
        return;
    }

    let mut entries: Vec<_> = flags.iter().collect();
    entries.sort_by_key(|(key, _)| key.as_str());

    for (key, value) in entries {
        println!("  {key}: {value}");
    }
}

pub fn print_rolls(rolls: &[RollRecord]) {
    if rolls.is_empty() {
        return;
    }

    println!("\nRolls:");
    for roll in rolls {
        println!("  {roll}");
    }
}

pub fn print_sfx_line(selected_sfx: Option<&SfxCue>) {
    match selected_sfx {
        Some(sfx) => println!("  sfx play: {} ({})", sfx.src, sfx.ref_id),
        None => println!("  sfx play: (none)"),
    }
}

pub fn print_music_change(previous: Option<&MusicCue>, current: Option<&MusicCue>) {
    match (previous, current) {
        (None, None) => println!("  music: (none)"),
        (None, Some(cue)) => {
            let loop_label = if cue.r#loop { "loop" } else { "once" };
            println!("  music start: {} ({}) [{loop_label}]", cue.src, cue.ref_id);
        }
        (Some(prev), Some(cur)) if prev.ref_id == cur.ref_id => {
            println!("  music unchanged: {} ({})", cur.src, cur.ref_id);
        }
        (Some(prev), Some(cur)) => {
            let loop_label = if cur.r#loop { "loop" } else { "once" };
            println!(
                "  music switch: {} ({}) -> {} ({}) [{loop_label}]",
                prev.src, prev.ref_id, cur.src, cur.ref_id
            );
        }
        (Some(prev), None) => {
            println!("  music stop: was {} ({})", prev.src, prev.ref_id);
        }
    }
}

pub fn print_harness_music(music: &MusicCue) {
    let loop_label = if music.r#loop { "loop" } else { "once" };
    println!(
        "\n[Harness] music: {} ({}) [{loop_label}]",
        music.src, music.ref_id
    );
}

pub fn print_harness_sfx(sfx: &SfxCue) {
    println!("[Harness] sfx: {} ({})", sfx.src, sfx.ref_id);
}

pub fn print_step(label: &str, view: &GameView) {
    if let Some(title) = &view.title {
        println!(
            "--- {label} — {title} [{mode}] ---",
            mode = format_mode(&view.mode)
        );
    } else {
        println!(
            "--- {label} — {} [{mode}] ---",
            view.node_id,
            mode = format_mode(&view.mode)
        );
    }

    for block in &view.text {
        println!("{}", block.text);
    }

    println!("\nPlayer stats:");
    print_sorted_i32_map(&view.player_stats);

    println!("\nInventory:");
    print_sorted_u32_map(&view.inventory);

    if !view.flags.is_empty() {
        println!("\nFlags:");
        print_flags(&view.flags);
    }

    if !view.events.is_empty() {
        println!("\nEvents:");
        for event in &view.events {
            println!("  {event}");
        }
    }

    print_choices(view);

    println!();
}

pub fn print_choices(view: &GameView) {
    if view.choices.is_empty() {
        println!("Choices: (none — use continue if the host supports it)");
        return;
    }

    println!("Choices:");
    for choice in &view.choices {
        let status = if choice.enabled {
            "enabled"
        } else {
            "disabled"
        };
        let mut line = format!("  [{status}] {} — {}", choice.id, choice.label);
        if let Some(check) = &choice.check {
            let label = check
                .label
                .as_deref()
                .map(|text| format!(" ({text})"))
                .unwrap_or_default();
            line.push_str(&format!(" ({} DC {}{label})", check.stat, check.difficulty));
        }
        if let Some(reason) = &choice.disabled_reason {
            line.push_str(&format!(" — {reason}"));
        }
        println!("{line}");
    }
}
