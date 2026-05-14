---
applyTo: "plugins/**,crates/**"
---

# Tauri Plugin & Rust Crate Conventions

## Vertical Slice Pattern

When adding new backend functionality, implement as a complete vertical slice:

1. **DB migration** (if needed) → `crates/db-user/src/migrations/`
2. **Rust operation** → `crates/db-user/src/*_ops.rs` or relevant crate
3. **Tauri command** → `plugins/<plugin>/src/commands/*.rs` with `#[tauri::command]` + Specta
4. **Register command** in plugin builder → `plugins/<plugin>/src/lib.rs`
5. **Regenerate bindings** → `bindings.gen.ts` gets updated automatically
6. **Frontend import** → `import { commands } from "@typr/plugin-<name>"`
7. **React Query wrapper** → `useQuery`/`useMutation` in the consuming component

## Tauri Command Pattern

```rust
#[tauri::command]
#[specta::specta]
pub async fn my_command(
    state: tauri::State<'_, DbState>,
    arg: String,
) -> Result<ReturnType, String> {
    let db = state.user_db()?;
    db.my_operation(arg).map_err(|e| e.to_string())
}
```

## Type Safety

- Use Specta for automatic TypeScript binding generation
- All command return types must be serializable (`serde::Serialize` + `specta::Type`)
- Union types use `#[serde(tag = "type")]` for TypeScript discriminated unions

## Database Migrations

- Migrations live in `crates/db-user/src/migrations/`
- Each migration is a `.sql` file with sequential naming
- Schema versioning handled by `typr-db-core`
- Test migrations: `pnpm test:db`
