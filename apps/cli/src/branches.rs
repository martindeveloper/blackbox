use std::path::Path;

use crate::harness::{print_music_change, print_rolls, print_sfx_line, print_step};
use anyhow::{Context, Result};
use blackbox::{Engine, MusicCue, PlayerCommand, SfxCue};

use crate::scenario_io::load_bundle_from_path;

pub fn run(scenario_path: &Path) -> Result<()> {
    println!("Blackbox CLI — scenario: {}", scenario_path.display());
    println!("Harness mode: audio cues, choice gates, and rolls are printed — not played.");
    println!("Scenario v2 features: requires/when, skill checks, expressions, RNG.\n");

    run_branch(
        scenario_path,
        "Branch 1: Diplomatic recon (checkpoint + disabled card gate)",
        &[
            "ask_what_it_prays_to",
            "continue",
            "enter_hatch",
            "continue",
        ],
    )?;

    run_branch(
        scenario_path,
        "Branch 2: Destroy the synthetic (game over)",
        &["destroy_the_android"],
    )?;

    run_branch(
        scenario_path,
        "Branch 3: Static shock loop (HP damage)",
        &["touch_the_server_rack"],
    )?;

    run_branch(
        scenario_path,
        "Branch 4: Card infiltration + stealth timing roll",
        &[
            "ask_what_it_prays_to",
            "continue",
            "search_chapel",
            "enter_hatch",
            "continue",
            "swipe_access_card",
            "approach_drone",
            "sneak_past",
        ],
    )?;

    run_branch(
        scenario_path,
        "Branch 5: Liturgical bypass (empathy skill check — fails on seed 1337)",
        &[
            "ask_what_it_prays_to",
            "continue",
            "enter_hatch",
            "continue",
            "quote_synthetic_prayer",
        ],
    )?;

    run_branch(
        scenario_path,
        "Branch 6: Firmware hack failure (lockdown game over)",
        &[
            "ask_what_it_prays_to",
            "continue",
            "enter_hatch",
            "continue",
            "hack_door_panel",
        ],
    )?;

    run_branch(
        scenario_path,
        "Branch 7: Full extraction (archive logic check → good ending)",
        &[
            "ask_what_it_prays_to",
            "continue",
            "search_chapel",
            "enter_hatch",
            "continue",
            "swipe_access_card",
            "approach_drone",
            "sneak_past",
            "export_incident",
        ],
    )?;

    Ok(())
}

fn run_branch(scenario_path: &Path, name: &str, choices: &[&str]) -> Result<()> {
    println!("============================================================");
    println!("{name}");
    println!("============================================================\n");

    let content = load_bundle_from_path(scenario_path).context("failed to load scenario bundle")?;
    let mut engine = Engine::new_game(content).context("failed to create engine")?;
    let view = engine
        .get_current_view()
        .context("failed to get initial view")?;

    let mut current_music = view.music.clone();

    print_step("Start", &view);
    print_step_audio_initial(current_music.as_deref());

    for (step, choice_id) in choices.iter().enumerate() {
        let previous_music = current_music.clone();

        let result = engine.submit_command(PlayerCommand::Choose {
            choice_id: (*choice_id).to_string(),
        });

        if !result.ok {
            let message = result
                .error
                .map(|error| error.to_string())
                .unwrap_or_else(|| "unknown error".to_string());
            anyhow::bail!(
                "step {} failed for choice '{choice_id}': {message}",
                step + 1
            );
        }

        let view = result
            .view
            .context("command succeeded but returned no view")?;

        current_music = view.music.clone();

        print_step(&format!("After choice: {choice_id}"), &view);
        print_step_audio(
            result.selected_sfx.as_deref(),
            result.triggered_sfx.as_deref(),
            previous_music.as_deref(),
            current_music.as_deref(),
        );
        print_rolls(&result.rolls);
    }

    println!();
    Ok(())
}

fn print_step_audio(
    selected_sfx: Option<&SfxCue>,
    triggered_sfx: Option<&SfxCue>,
    previous_music: Option<&MusicCue>,
    current_music: Option<&MusicCue>,
) {
    println!("Audio (harness):");
    print_sfx_line(selected_sfx);
    if let Some(sfx) = triggered_sfx {
        println!("  triggered sfx: {} ({})", sfx.src, sfx.ref_id);
    }
    print_music_change(previous_music, current_music);
    println!();
}

fn print_step_audio_initial(current_music: Option<&MusicCue>) {
    println!("Audio (harness):");
    print_music_change(None, current_music);
    println!();
}
