#[derive(thiserror::Error, Debug)]
pub enum Error {
    #[error("failed to parse markdown")]
    MarkdownParseError(String),
    #[error("failed to render markdown")]
    MarkdownRenderError(String),
    #[error("failed to render html")]
    HTMLRenderError(String),
    #[error("failed to parse html")]
    HTMLParseError(String),
}

pub fn opinionated_md_to_html(text: impl AsRef<str>) -> Result<String, Error> {
    let md = md_to_md(text)?;
    let md_with_mentions = transform_mentions_in_markdown(&md);
    md_to_html(&md_with_mentions)
}

pub fn opinionated_md_to_md(text: impl AsRef<str>) -> Result<String, Error> {
    md_to_md(text)
}

fn md_to_md(text: impl AsRef<str>) -> Result<String, Error> {
    let mut text = text.as_ref().to_string();

    let txt_transformations: Vec<Box<dyn Fn(&mut String)>> = vec![
        Box::new(remove_char_repeat),
        Box::new(normalize_indented_list_markers),
    ];

    for t in txt_transformations {
        t(&mut text);
    }

    let mut ast = markdown::to_mdast(
        text.as_ref(),
        &markdown::ParseOptions {
            constructs: markdown::Constructs {
                gfm_table: true, // Enable GitHub Flavored Markdown tables
                ..Default::default()
            },
            ..Default::default()
        },
    )
    .map_err(|e| Error::MarkdownParseError(e.to_string()))?;

    let md_transformations: Vec<Box<dyn Fn(&mut markdown::mdast::Node)>> = vec![
        Box::new(remove_thematic_break),
        Box::new(remove_empty_headings),
        Box::new(|node| {
            set_heading_level_from(node, 2, false);
        }),
        Box::new(flatten_headings),
        Box::new(convert_ordered_to_unordered),
        Box::new(add_paragraphs_before_headings),
        Box::new(convert_tables_to_lists), // Convert markdown tables to definition lists
    ];

    for t in md_transformations {
        t(&mut ast);
    }

    let md = mdast_util_to_markdown::to_markdown_with_options(
        &ast,
        &mdast_util_to_markdown::Options {
            bullet: '-',
            ..Default::default()
        },
    )
    .map_err(|e| Error::MarkdownRenderError(e.to_string()))?;

    Ok(md)
}

fn md_to_html(text: &str) -> Result<String, Error> {
    let html = markdown::to_html_with_options(
        text,
        &markdown::Options {
            parse: markdown::ParseOptions {
                constructs: markdown::Constructs {
                    gfm_autolink_literal: true,
                    ..Default::default()
                },
                ..Default::default()
            },
            compile: markdown::CompileOptions {
                allow_dangerous_html: true,
                ..Default::default()
            },
        },
    )
    .map_err(|e| Error::HTMLRenderError(e.to_string()))?;

    let dom = tl::parse(&html, tl::ParserOptions::default())
        .map_err(|e| Error::HTMLParseError(e.to_string()))?;

    Ok(dom.outer_html())
}

fn transform_mentions_in_markdown(markdown: &str) -> String {
    // @[label](type:id)
    let re = regex::Regex::new(r"@\[([^\]]+)\]\(([^:]+):([^)]+)\)").unwrap();

    re.replace_all(markdown, |caps: &regex::Captures| {
        let label = &caps[1];
        let mention_type = &caps[2];
        let id = &caps[3];

        let app_url = format!("/app/{}/{}", mention_type, id);

        format!(
            r#"<a class="mention" data-mention="true" data-id="{}" data-type="{}" data-label="{}" href="javascript:void(0)" onclick="event.preventDefault(); if (window.__TYPR_NAVIGATE__) window.__TYPR_NAVIGATE__('{}');">@{}</a>"#,
            id, mention_type, label, app_url, label
        )
    }).to_string()
}

fn remove_char_repeat(text: &mut String) {
    let lines: Vec<&str> = text.lines().collect();
    let filtered_lines: Vec<String> = lines
        .iter()
        .filter_map(|line| {
            if line.len() >= 6 {
                let chars: Vec<char> = line.chars().collect();
                if !chars.is_empty() {
                    let first_char = chars[0];

                    if !first_char.is_alphanumeric()
                        && !first_char.is_whitespace()
                        && chars.iter().all(|&c| c == first_char)
                    {
                        return None;
                    }
                }
            }
            Some(line.to_string())
        })
        .collect();

    *text = filtered_lines.join("\n");
}

fn normalize_indented_list_markers(text: &mut String) {
    let unordered = regex::Regex::new(r"(?m)^ {4,}([-*+]\s+)").unwrap();
    let ordered = regex::Regex::new(r"(?m)^ {4,}(\d+[.)]\s+)").unwrap();

    *text = unordered.replace_all(text, "  $1").to_string();
    *text = ordered.replace_all(text, "  $1").to_string();
}

fn convert_ordered_to_unordered(node: &mut markdown::mdast::Node) {
    if let markdown::mdast::Node::List(list) = node {
        list.ordered = false;
        list.spread = false;
    }

    if let Some(children) = node.children_mut() {
        for child in children {
            convert_ordered_to_unordered(child);
        }
    }
}

fn set_heading_level_from(node: &mut markdown::mdast::Node, depth: u8, header_found: bool) -> bool {
    let mut found_any_heading = header_found;

    if let markdown::mdast::Node::Heading(heading) = node {
        found_any_heading = true;
        heading.depth = depth;

        if let Some(children) = node.children_mut() {
            for child in children {
                set_heading_level_from(child, depth + 1, found_any_heading);
            }
        }
    } else if let Some(children) = node.children_mut() {
        for child in children {
            let child_found = set_heading_level_from(child, depth, found_any_heading);
            found_any_heading = found_any_heading || child_found;
        }
    }

    found_any_heading
}

fn flatten_headings(node: &mut markdown::mdast::Node) {
    if let markdown::mdast::Node::Heading(heading) = node {
        if heading.depth > 3 {
            let children = node.children().cloned().unwrap_or_default();

            let strong_node = markdown::mdast::Node::Strong(markdown::mdast::Strong {
                children,
                position: None,
            });

            *node = markdown::mdast::Node::Paragraph(markdown::mdast::Paragraph {
                children: vec![strong_node],
                position: None,
            });
        }
    }

    if let Some(children) = node.children_mut() {
        for child in children {
            flatten_headings(child);
        }
    }
}

fn remove_thematic_break(node: &mut markdown::mdast::Node) {
    if let markdown::mdast::Node::ThematicBreak(_) = node {
        *node = markdown::mdast::Node::Paragraph(markdown::mdast::Paragraph {
            children: vec![],
            position: None,
        });
    }

    if let Some(children) = node.children_mut() {
        for child in children {
            remove_thematic_break(child);
        }
    }
}

fn remove_empty_headings(node: &mut markdown::mdast::Node) {
    if let Some(children) = node.children_mut() {
        let mut i = 0;
        while i < children.len() {
            if let Some(next) = children.get(i + 1) {
                if matches!(&children[i], markdown::mdast::Node::Heading(_))
                    && matches!(next, markdown::mdast::Node::Heading(_))
                {
                    children.remove(i);
                    continue;
                }
            }
            i += 1;
        }

        for child in children.iter_mut() {
            remove_empty_headings(child);
        }
    }
}

fn add_paragraphs_before_headings(node: &mut markdown::mdast::Node) {
    if let Some(children) = node.children_mut() {
        let mut heading_positions = Vec::new();
        let mut found_first_heading = false;

        for (i, child) in children.iter().enumerate() {
            if let markdown::mdast::Node::Heading(_) = child {
                if found_first_heading {
                    heading_positions.push(i);
                } else {
                    found_first_heading = true;
                }
            }
        }

        for pos in heading_positions.iter().rev() {
            let text_node = markdown::mdast::Node::Text(markdown::mdast::Text {
                value: "\u{00A0}".to_string(),
                position: None,
            });

            let para = markdown::mdast::Node::Paragraph(markdown::mdast::Paragraph {
                children: vec![text_node],
                position: None,
            });

            children.insert(*pos, para);
        }

        for child in children.iter_mut() {
            add_paragraphs_before_headings(child);
        }
    }
}

/// Helper function to recursively extract all text from a node (handles bold, italic, etc.)
fn extract_text_from_node(node: &markdown::mdast::Node) -> String {
    use markdown::mdast::Node;

    match node {
        Node::Text(t) => t.value.clone(),
        _ => {
            if let Some(children) = node.children() {
                children
                    .iter()
                    .map(|child| extract_text_from_node(child))
                    .collect::<Vec<_>>()
                    .join("")
            } else {
                String::new()
            }
        }
    }
}

/// Converts markdown tables to simple bulleted lists
/// Tables are not supported in Tiptap editor, so flatten them to bullets
/// Each row becomes a bullet with all cells joined by " - " separator
fn convert_tables_to_lists(node: &mut markdown::mdast::Node) {
    use markdown::mdast::{List, ListItem, Node, Paragraph, Strong, Text};

    if let Node::Table(table) = node {
        // Skip header row, convert data rows to list items
        let list_items: Vec<Node> = table
            .children
            .iter()
            .skip(1) // Skip header row
            .filter_map(|row| {
                if let Node::TableRow(table_row) = row {
                    // Extract cell contents (recursively handle nested formatting)
                    let cells: Vec<String> = table_row
                        .children
                        .iter()
                        .filter_map(|cell| {
                            if let Node::TableCell(tc) = cell {
                                // Extract all text from cell children, including nested formatting
                                let text: String = tc
                                    .children
                                    .iter()
                                    .map(|child| extract_text_from_node(child))
                                    .collect::<Vec<_>>()
                                    .join("")
                                    .trim()
                                    .to_string();

                                if text.is_empty() {
                                    None
                                } else {
                                    Some(text)
                                }
                            } else {
                                None
                            }
                        })
                        .collect();

                    if cells.is_empty() {
                        return None;
                    }

                    // Skip first column if it's just a row number (like "1", "2", "17")
                    let filtered_cells: Vec<&String> = if cells.len() >= 2 {
                        let first_cell = cells[0].trim();
                        if first_cell.chars().all(|c| c.is_numeric()) {
                            // Skip the number column
                            cells.iter().skip(1).collect()
                        } else {
                            cells.iter().collect()
                        }
                    } else {
                        cells.iter().collect()
                    };

                    // Format: **First cell**: Remaining cells
                    // This creates a definition list style
                    let children = if filtered_cells.len() >= 2 {
                        let key = filtered_cells[0].as_str();
                        let value = filtered_cells[1..]
                            .iter()
                            .map(|s| s.as_str())
                            .collect::<Vec<_>>()
                            .join(" - ");

                        vec![
                            Node::Strong(Strong {
                                children: vec![Node::Text(Text {
                                    value: key.to_string(),
                                    position: None,
                                })],
                                position: None,
                            }),
                            Node::Text(Text {
                                value: format!(": {}", value),
                                position: None,
                            }),
                        ]
                    } else if !filtered_cells.is_empty() {
                        // Single cell: plain bullet
                        vec![Node::Text(Text {
                            value: filtered_cells[0].to_string(),
                            position: None,
                        })]
                    } else {
                        return None;
                    };

                    Some(Node::ListItem(ListItem {
                        children: vec![Node::Paragraph(Paragraph {
                            children,
                            position: None,
                        })],
                        checked: None,
                        spread: false,
                        position: None,
                    }))
                } else {
                    None
                }
            })
            .collect();

        // Replace table with unordered list
        *node = Node::List(List {
            children: list_items,
            ordered: false,
            start: None,
            spread: false,
            position: None,
        });
    }

    // Recursively process children
    if let Some(children) = node.children_mut() {
        for child in children {
            convert_tables_to_lists(child);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_md_to_md_1() {
        let input = r#"
# Hello

## World

1. Hi
2. Bye!
"#;

        insta::assert_snapshot!(md_to_md(input).unwrap().to_string(), @r###"
        ## World

        - Hi
        - Bye!
        "###);
    }

    #[test]
    fn test_md_to_md_2() {
        let input = r#"
## Hello

### World

1. Hi
2. Bye!
"#;
        insta::assert_snapshot!(md_to_md(input).unwrap().to_string(), @r###"
        ## World

        - Hi
        - Bye!
        "###);
    }

    #[test]
    fn test_md_to_md_3() {
        let input = r#"
# Enhanced Meeting Notes
## What Typr Does
- A smart notepad for people with back-to-back meetings.
- Listens to the meeting so you don't have to write everything down.
- Merges your notes and the transcript into a clean, context-aware summary.
- Note-taking is optional but helps highlight what's important to you.

## Privacy and Performance
- Built local-first: works offline and stores data on your device.
- Prioritizes user privacy and seamless experience.

## Flexible and Extendable
- Not limited to specific use cases like sales.
- Simple for anyone to use out of the box.
- Offers powerful extensions—like real-time transcripts and CRM uploads (e.g. Twenty).

## Stay Connected
- Follow updates on [GitHub Releases](https://github.com/juanmaramos/typr-oss/releases).
- Report issues on [GitHub Issues](https://github.com/juanmaramos/typr-oss/issues).

# Participants:

* Alex
* Sam

# Meeting Transcript
(No raw excerpt provided, utilized to generate the enhanced note)
"#;

        insta::assert_snapshot!(md_to_md(input).unwrap().to_string(), @r###"
        ## What Typr Does

        - A smart notepad for people with back-to-back meetings.
        - Listens to the meeting so you don't have to write everything down.
        - Merges your notes and the transcript into a clean, context-aware summary.
        - Note-taking is optional but helps highlight what's important to you.

         

        ## Privacy and Performance

        - Built local-first: works offline and stores data on your device.
        - Prioritizes user privacy and seamless experience.

         

        ## Flexible and Extendable

        - Not limited to specific use cases like sales.
        - Simple for anyone to use out of the box.
        - Offers powerful extensions—like real-time transcripts and CRM uploads (e.g. Twenty).

         

        ## Stay Connected

        - Follow updates on [GitHub Releases](https://github.com/juanmaramos/typr-oss/releases).
        - Report issues on [GitHub Issues](https://github.com/juanmaramos/typr-oss/issues).

         

        ## Participants:

        - Alex
        - Sam

         

        ## Meeting Transcript

        (No raw excerpt provided, utilized to generate the enhanced note)
        "###);
    }

    // TODO: not ideal
    #[test]
    fn test_md_to_md_4() {
        let input = r#"
# Typr: Enhanced Meeting Notes

# Objective: Introduce Typr as a smart notepad for enhanced meeting productivity.
# Privacy & Performance: Built locally, prioritizing user data security and seamless experience.
# Flexible & Extendable: Supports various use cases beyond sales, offering a simple and powerful solution.
# Stay Connected: Promote Typr through GitHub.

# Key Features:
# - Offline transcription and note-taking.
# - Real-time transcript integration for context.
# - Customizable notes and summaries.
# - Optional extensions for CRM integration (e.g., Twenty).

# Benefits: Streamlines meetings, improves productivity, and enhances data capture.

# Further Information: Follow updates on [GitHub Releases](https://github.com/juanmaramos/typr-oss/releases).
        "#;

        insta::assert_snapshot!(md_to_md(input).unwrap().to_string(), @"## Further Information: Follow updates on [GitHub Releases](https://github.com/juanmaramos/typr-oss/releases).");
    }

    #[test]
    fn test_opinionated_md_to_html() {
        let input = r#"
# Enhanced Meeting Notes
## What Typr Does
- A smart notepad for people with back-to-back meetings.
- Listens to the meeting so you don't have to write everything down.
- Merges your notes and the transcript into a clean, context-aware summary.
- Note-taking is optional but helps highlight what's important to you.

## Privacy and Performance
- Built local-first: works offline and stores data on your device.
- Prioritizes user privacy and seamless experience.

## Flexible and Extendable
- Not limited to specific use cases like sales.
- Simple for anyone to use out of the box.
- Offers powerful extensions—like real-time transcripts and CRM uploads (e.g. Twenty).

## Stay Connected
- Follow updates on [GitHub Releases](https://github.com/juanmaramos/typr-oss/releases).
- Report issues on [GitHub Issues](https://github.com/juanmaramos/typr-oss/issues).
"#;

        insta::assert_snapshot!(opinionated_md_to_html(input).unwrap().to_string(), @r###"
        <h2>What Typr Does</h2>
        <ul>
        <li>A smart notepad for people with back-to-back meetings.</li>
        <li>Listens to the meeting so you don't have to write everything down.</li>
        <li>Merges your notes and the transcript into a clean, context-aware summary.</li>
        <li>Note-taking is optional but helps highlight what's important to you.</li>
        </ul>
        <p> </p>
        <h2>Privacy and Performance</h2>
        <ul>
        <li>Built local-first: works offline and stores data on your device.</li>
        <li>Prioritizes user privacy and seamless experience.</li>
        </ul>
        <p> </p>
        <h2>Flexible and Extendable</h2>
        <ul>
        <li>Not limited to specific use cases like sales.</li>
        <li>Simple for anyone to use out of the box.</li>
        <li>Offers powerful extensions—like real-time transcripts and CRM uploads (e.g. Twenty).</li>
        </ul>
        <p> </p>
        <h2>Stay Connected</h2>
        <ul>
        <li>Follow updates on <a href="https://github.com/juanmaramos/typr-oss/releases">GitHub Releases</a>.</li>
        <li>Report issues on <a href="https://github.com/juanmaramos/typr-oss/issues">GitHub Issues</a>.</li>
        </ul>
        "###);
    }

    #[test]
    fn test_mention_transformation() {
        let input =
            r#"Hello @[John Doe](user:john-doe) and @[Jane Smith](workspace:jane-workspace)!"#;

        let html = opinionated_md_to_html(input).unwrap();
        println!("HTML output: {}", html);

        assert!(html.contains(r#"data-mention="true""#));
        assert!(html.contains(r#"data-id="john-doe""#));
        assert!(html.contains(r#"data-type="user""#));
        assert!(html.contains(r#"data-label="John Doe""#));
        assert!(html.contains(r#"@John Doe"#));
        assert!(html.contains(r#"data-id="jane-workspace""#));
        assert!(html.contains(r#"data-type="workspace""#));
        assert!(html.contains(r#"@Jane Smith"#));
    }

    #[test]
    fn test_table_to_list_conversion() {
        let input = r#"
# Key Ideas

| # | Topic | Description |
|---|-------|-------------|
| 1 | User-first context | Notes are tailored to how a user thinks |
| 2 | Habit-building hook | Meetings are already on the calendar |
| 3 | AI as a tool | The real competitive edge is switching costs |
"#;

        let html = opinionated_md_to_html(input).unwrap();
        println!("Converted HTML:\n{}", html);

        // Should convert table to definition list, skipping number column
        assert!(html.contains("<ul>"));
        assert!(html.contains("<strong>User-first context</strong>: Notes are tailored"));
        assert!(html.contains("<strong>Habit-building hook</strong>"));
        assert!(html.contains("<strong>AI as a tool</strong>"));

        // Should NOT contain table tags or row numbers
        assert!(!html.contains("<table>"));
        assert!(!html.contains("<tr>"));
        assert!(!html.contains("<td>"));
        assert!(!html.contains(">1 - ")); // Row numbers should be skipped
    }

    #[test]
    fn test_table_with_two_columns() {
        let input = r#"
| Name | Value |
|------|-------|
| Price | $99 |
| Stock | 42 |
"#;

        let html = opinionated_md_to_html(input).unwrap();
        println!("Two-column table HTML:\n{}", html);

        // Should convert to definition list format (no number column to skip)
        assert!(html.contains("<ul>"));
        assert!(html.contains("<strong>Price</strong>: $99"));
        assert!(html.contains("<strong>Stock</strong>: 42"));
        assert!(!html.contains("<table>"));
    }

    #[test]
    fn test_table_with_inline_formatting() {
        let input = r#"
| # | Topic | Description |
|---|-------|-------------|
| 1 | **User-first context** | Notes are tailored to *how* a user thinks |
| 2 | **Habit-building** | Meetings on calendar |
"#;

        let html = opinionated_md_to_html(input).unwrap();
        println!("Table with formatting HTML:\n{}", html);

        // Should extract text from bold/italic formatting
        assert!(html.contains("User-first context"));
        assert!(html.contains("Habit-building"));
        assert!(html.contains("how"));
    }

    #[test]
    fn test_indented_bullets_do_not_become_code_blocks() {
        let input = r#"
# Error correction

- The discussion frames improvements as repeated error correction:

    - better coding agents
    - thinking models
    - hallucination reduction
"#;

        let html = opinionated_md_to_html(input).unwrap();

        assert!(html.contains("<li>better coding agents</li>"));
        assert!(html.contains("<li>thinking models</li>"));
        assert!(html.contains("<li>hallucination reduction</li>"));
        assert!(!html.contains("<pre>"));
        assert!(!html.contains("<code>"));
    }
}
