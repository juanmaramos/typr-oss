# @typr/fonts

This package provides font definitions and assets for Typr applications.

## Version: 1.0.0

## Usage

### Import all fonts

```js
import '@typr/fonts/css';
```

### Use font constants

```js
import { FONT_FAMILIES } from '@typr/fonts';

const styles = {
  fontFamily: FONT_FAMILIES.SWITZER
};
```

### Check if fonts are loaded

```js
import { areFontsLoaded } from '@typr/fonts';

areFontsLoaded().then((loaded) => {
  if (loaded) {
    console.log('Fonts are loaded!');
  }
});
```

## Font families

- **Switzer** - Main sans-serif font family
- **Crimson Pro** - Serif font family for editorial surfaces
- **JetBrains Mono** - Monospace font family

## CSS Variables

This package defines the following CSS variables:

- `--font-sans` - Default sans-serif font stack (Switzer)
- `--font-serif` - Default serif font stack (Crimson Pro)
- `--font-mono` - Default monospace font stack (JetBrains Mono)

## Tauri Integration

For Tauri applications, add the font files to the bundle resources in `tauri.conf.json`:

```json
"bundle": {
  "resources": [
    "../node_modules/@typr/fonts/src/assets/**/*"
  ]
}
```
