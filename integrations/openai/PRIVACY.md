# Typr plugin privacy

Effective date: October 23, 2026. This notice covers the Typr desktop
plugin published by Rhams LLC in the
[Typr OSS repository](https://github.com/juanmaramos/typr-oss). It does not
describe every feature of the Typr desktop app or your AI client.

## What the plugin accesses

When enabled in a local chat, the plugin lets your AI client search and read
the production Typr OSS database in this computer's standard app data folder.
Access covers the database, rather than a selection of notes. Results can
contain meeting titles, notes, summaries, stored transcripts, session IDs,
dates, tags, projects, and personal information people included in those
records. Search can match participant names and email addresses.

The plugin uses these records to answer meeting searches and retrieve notes
and transcripts you request. It opens SQLite read-only. It cannot edit or
delete meetings, record audio, or search transcript text. It does not add
encryption to the database; device security and disk encryption are separate.

## Where information goes

The bundled server communicates over local standard input/output with the AI
client that launched it. The plugin has no hosted Typr service, network
listener, or analytics integration. Installing it does not upload the entire
database to a Typr service.

**Returned content is shared with your selected AI client. That client may
send it to its AI provider for processing.** Its privacy policy, account
settings, retention rules, and terms apply to that processing. Local database
access does not mean that a chat using the plugin stays on your device.
Only enable the plugin in clients you trust, for information you have
permission to share. Review the client's data controls before using sensitive
meeting records.

## Storage and retention

The plugin does not maintain its own copy of retrieved notes or a hosted
account. It reads the database managed by Typr. Operational messages on
standard error can include tool names, record IDs, counts, and errors; the
server does not intentionally log meeting text, titles, or search queries.
The host may retain these logs and cache the installed plugin.

Your AI client and provider may retain tool results in chat history or logs.
Disabling or uninstalling the plugin does not erase earlier chat content.
Deleting a note in Typr does not remove copies already shared with a client,
provider, or backup.

## Your controls and support

Disable or uninstall Typr through your AI client's plugin settings to
stop future access through that plugin. Manage source records in Typr, and
manage shared content, retention, and deletion through the AI client and
provider. The plugin has no separate remote account to delete.

For questions about this plugin or this notice, contact the maintainer through
[Typr OSS issues](https://github.com/juanmaramos/typr-oss/issues). Public issues
are visible to others. Do not include private meeting content, databases,
credentials, or personal information in an issue. For security reports, see
the repository's [security policy](../../SECURITY.md).
