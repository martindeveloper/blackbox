use std::io::{self, Write};
use std::path::Path;

use crate::harness::{
    print_flags, print_harness_music, print_harness_sfx, print_sorted_i32_map, print_sorted_u32_map,
};
use anyhow::{Context, Result};
use blackbox::{Engine, PlayerCommand};
use blackbox_format::JsonFormat;

use crate::scenario_io::load_bundle_from_path;

const FORMAT: JsonFormat = JsonFormat;

pub fn run(scenario_path: &Path) -> Result<()> {
    let content = load_bundle_from_path(scenario_path).context("failed to load scenario bundle")?;
    let mut engine = Engine::new_game(content).context("failed to create engine")?;

    println!("Blackbox terminal playground");
    println!("Scenario: {}", scenario_path.display());
    println!("Harness mode: audio cues are printed, not played.");
    println!("Type a choice number, choice id, state, save, or exit.\n");

    loop {
        let view = engine.get_current_view().context("failed to get view")?;

        print_view(&view);

        if view.mode.is_terminal() {
            println!(
                "\n{}.",
                if view.mode == blackbox::content::NodeMode::Ending {
                    "Story complete"
                } else {
                    "Game over"
                }
            );
            break;
        }

        if view.choices.is_empty() {
            println!("\nNo choices available. End of story.");
            break;
        }

        print!("Command: ");
        io::stdout().flush()?;
        let mut input = String::new();
        io::stdin().read_line(&mut input)?;
        let input = input.trim();

        if input.eq_ignore_ascii_case("exit") {
            break;
        }

        if input.eq_ignore_ascii_case("state") {
            print_state(engine.get_state());
            continue;
        }

        if input.eq_ignore_ascii_case("save") {
            println!("\n{}", FORMAT.encode_state_utf8(engine.get_state())?);
            continue;
        }

        let command = if let Ok(index) = input.parse::<usize>() {
            if index == 0 || index > view.choices.len() {
                println!("Invalid choice index.\n");
                continue;
            }

            PlayerCommand::Choose {
                choice_id: view.choices[index - 1].id.clone(),
            }
        } else {
            PlayerCommand::Choose {
                choice_id: input.to_string(),
            }
        };

        let previous_event_count = engine.get_state().events.len();
        let result = engine.submit_command(command);

        if !result.ok {
            let message = result
                .error
                .map(|error| error.to_string())
                .unwrap_or_else(|| "unknown error".to_string());
            println!("\nError: {message}\n");
            continue;
        }

        if let Some(sfx) = result.selected_sfx {
            print_harness_sfx(&sfx);
        }
        if let Some(sfx) = result.triggered_sfx {
            println!("[Harness] triggered sfx: {} ({})", sfx.src, sfx.ref_id);
        }

        if let Some(view) = result.view {
            for event in &view.events[previous_event_count..] {
                println!("\nEvent: {event}");
            }
            println!();
        }
    }

    Ok(())
}

fn print_view(view: &blackbox::GameView) {
    if let Some(title) = &view.title {
        println!("=== {title} ===");
    } else {
        println!("=== {} ===", view.node_id);
    }

    for block in &view.text {
        println!("{}", block.text);
    }

    if let Some(music) = &view.music {
        print_harness_music(music);
    }

    println!("\nPlayer Stats:");
    print_sorted_i32_map(&view.player_stats);

    println!("\nInventory:");
    print_sorted_u32_map(&view.inventory);

    println!("\nFlags:");
    print_flags(&view.flags);

    if !view.events.is_empty() {
        println!("\nEvents:");
        for event in &view.events {
            println!("  {event}");
        }
    }

    println!("\nChoices:");
    for (index, choice) in view.choices.iter().enumerate() {
        let sfx = choice
            .sfx
            .as_ref()
            .map(|cue| format!(" sfx={}", cue.src))
            .unwrap_or_default();
        println!("  {}) {} [{}]{sfx}", index + 1, choice.label, choice.id);
    }

    println!();
}

fn print_state(state: &blackbox::GameState) {
    println!("\nState summary:");
    println!("  current_node_id: {}", state.current_node_id);
    println!("  visited_nodes: {:?}", state.visited_nodes);
    print_sorted_i32_map(&state.player.stats);
    print_sorted_u32_map(&state.inventory.items);
    print_flags(&state.flags);
    println!("  events: {:?}", state.events);
    println!();
}
