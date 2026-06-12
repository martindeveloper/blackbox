mod branches;
mod harness;
mod play;
mod scenario_io;

use std::path::PathBuf;

use anyhow::{Result, bail};

const DEFAULT_SCENARIO: &str = "data/silent_archive_game/scenario.json";

fn main() -> Result<()> {
    match parse_command(std::env::args().skip(1).collect())? {
        Command::Branches { scenario } => branches::run(&scenario),
        Command::Play { scenario } => play::run(&scenario),
    }
}

enum Command {
    Branches { scenario: PathBuf },
    Play { scenario: PathBuf },
}

fn parse_command(args: Vec<String>) -> Result<Command> {
    let mut args = args.into_iter();
    let first = args.next();

    match first.as_deref() {
        None => Ok(Command::Branches {
            scenario: default_scenario_path(),
        }),
        Some("-h" | "--help" | "help") => {
            print_usage();
            std::process::exit(0);
        }
        Some("play") => Ok(Command::Play {
            scenario: next_scenario_path(args.next())?,
        }),
        Some("branches") => Ok(Command::Branches {
            scenario: next_scenario_path(args.next())?,
        }),
        Some(path) => {
            if args.next().is_some() {
                bail!("unexpected extra arguments; run with --help for usage");
            }
            Ok(Command::Branches {
                scenario: PathBuf::from(path),
            })
        }
    }
}

fn next_scenario_path(path: Option<String>) -> Result<PathBuf> {
    Ok(path
        .map(PathBuf::from)
        .unwrap_or_else(default_scenario_path))
}

fn default_scenario_path() -> PathBuf {
    PathBuf::from(DEFAULT_SCENARIO)
}

fn print_usage() {
    println!(
        "Blackbox CLI — terminal harness for scenario playthroughs

Usage:
  blackbox-cli [scenario.json]              Run scripted regression branches
  blackbox-cli branches [scenario.json]     Same as above
  blackbox-cli play [scenario.json]         Interactive terminal playground

Default scenario: {DEFAULT_SCENARIO}
"
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_command_runs_branches() {
        let command = parse_command(vec![]).unwrap();
        assert!(matches!(command, Command::Branches { .. }));
    }

    #[test]
    fn play_subcommand() {
        let command = parse_command(vec!["play".into()]).unwrap();
        assert!(matches!(command, Command::Play { .. }));
    }

    #[test]
    fn scenario_path_without_subcommand() {
        let command = parse_command(vec!["data/foo/scenario.json".into()]).unwrap();
        match command {
            Command::Branches { scenario } => {
                assert_eq!(scenario, PathBuf::from("data/foo/scenario.json"));
            }
            Command::Play { .. } => panic!("expected branches"),
        }
    }
}
