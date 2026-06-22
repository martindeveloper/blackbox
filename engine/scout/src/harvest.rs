use blackbox::GameContent;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Category {
    Chapter,
    Node,
    Item,
    Character,
    Flag,
    Event,
    Texture,
    Music,
    Sfx,
}

impl Category {
    pub fn name(self) -> &'static str {
        match self {
            Category::Chapter => "chapter",
            Category::Node => "node",
            Category::Item => "item",
            Category::Character => "character",
            Category::Flag => "flag",
            Category::Event => "event",
            Category::Texture => "texture",
            Category::Music => "music",
            Category::Sfx => "sfx",
        }
    }

    pub const ALL: [Category; 9] = [
        Category::Chapter,
        Category::Node,
        Category::Item,
        Category::Character,
        Category::Flag,
        Category::Event,
        Category::Texture,
        Category::Music,
        Category::Sfx,
    ];

    /// Map a user filter token to one or more categories. `asset`/`assets`
    /// expands to the three media kinds; other tokens accept a trailing `s`.
    pub fn parse(token: &str) -> Option<&'static [Category]> {
        Some(match token.trim().trim_end_matches('s') {
            "chapter" => &[Category::Chapter],
            "node" => &[Category::Node],
            "item" => &[Category::Item],
            "character" | "char" => &[Category::Character],
            "flag" => &[Category::Flag],
            "event" => &[Category::Event],
            "texture" | "tex" => &[Category::Texture],
            "music" => &[Category::Music],
            "sfx" => &[Category::Sfx],
            "asset" => &[Category::Texture, Category::Music, Category::Sfx],
            _ => return None,
        })
    }
}

/// A searchable entity, borrowing its strings from the loaded [`GameContent`].
/// `text` holds extra body fragments (node prose, choice labels, descriptions,
/// subtitles…) searched only in full-text mode; it stays empty otherwise.
pub struct Candidate<'a> {
    pub cat: Category,
    pub id: &'a str,
    pub label: &'a str,
    pub chapter: Option<&'a str>,
    pub scenario: &'a str,
    pub text: Vec<&'a str>,
}

/// Append every entity in the enabled categories to `out`, tagging each with
/// `scenario`. `enabled[cat]` gates each kind so the harvest skips categories
/// the caller filtered out entirely. When `full_text`, each candidate also
/// carries its body fragments for substring matching.
pub fn collect<'a>(
    content: &'a GameContent,
    scenario: &'a str,
    enabled: &[bool; 9],
    full_text: bool,
    out: &mut Vec<Candidate<'a>>,
) {
    let on = |c: Category| enabled[c as usize];
    let mut push = |cat, id, label, chapter, text: Vec<&'a str>| {
        out.push(Candidate {
            cat,
            id,
            label,
            chapter,
            scenario,
            text,
        });
    };

    if on(Category::Chapter) {
        for ch in &content.chapters {
            push(Category::Chapter, &ch.id, &ch.title, None, Vec::new());
        }
    }
    if on(Category::Node) {
        for node in content.nodes.values() {
            push(
                Category::Node,
                &node.id,
                node.title.as_deref().unwrap_or(&node.id),
                content.node_chapter.get(&node.id).map(String::as_str),
                if full_text { node_text(node) } else { Vec::new() },
            );
        }
    }
    if on(Category::Item) {
        for item in content.items.items.values() {
            let text = if full_text {
                [Some(item.description.as_str()), item.examine_text.as_deref()]
                    .into_iter()
                    .flatten()
                    .collect()
            } else {
                Vec::new()
            };
            push(Category::Item, &item.id, &item.name, None, text);
        }
    }
    if on(Category::Character) {
        for ch in content.characters.characters.values() {
            let text = match (full_text, ch.subtitle.as_deref()) {
                (true, Some(sub)) => vec![sub],
                _ => Vec::new(),
            };
            push(Category::Character, &ch.id, &ch.name, None, text);
        }
    }
    if on(Category::Flag) {
        for (key, entry) in &content.meta.flags {
            let text = catalog_text(full_text, entry);
            push(
                Category::Flag,
                key,
                entry.title.as_deref().unwrap_or(key),
                None,
                text,
            );
        }
    }
    if on(Category::Event) {
        for (key, entry) in &content.meta.events {
            let text = catalog_text(full_text, entry);
            push(
                Category::Event,
                key,
                entry.title.as_deref().unwrap_or(key),
                None,
                text,
            );
        }
    }
    if on(Category::Texture) {
        for key in content.assets.textures.keys() {
            push(Category::Texture, key, key, None, Vec::new());
        }
    }
    if on(Category::Music) {
        for key in content.assets.music.keys() {
            push(Category::Music, key, key, None, Vec::new());
        }
    }
    if on(Category::Sfx) {
        for key in content.assets.sfx.keys() {
            push(Category::Sfx, key, key, None, Vec::new());
        }
    }
}

/// Body fragments of a node: prose (text + fallback else_text) and choice labels.
fn node_text(node: &blackbox::content::NodeContent) -> Vec<&str> {
    let mut out = Vec::with_capacity(node.text.len() + node.choices.len());
    for block in &node.text {
        out.push(block.text.as_str());
        if let Some(else_text) = block.else_text.as_deref() {
            out.push(else_text);
        }
    }
    for choice in &node.choices {
        out.push(choice.presentation.label.as_str());
    }
    out
}

fn catalog_text(full_text: bool, entry: &blackbox::content::CatalogEntry) -> Vec<&str> {
    match (full_text, entry.description.as_deref()) {
        (true, Some(desc)) => vec![desc],
        _ => Vec::new(),
    }
}
