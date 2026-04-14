# New Jehlum  Gold Smith Ledger - Build Instructions

This application is built using Electron and React.

## How to Fix Visual Studio Code Errors
If you see red lines under `import React` or `App`, it is because the computer needs to download the "rules" (type definitions) for these libraries.

1.  **Install Node.js**: Install the latest LTS version from [https://nodejs.org/](https://nodejs.org/).
2.  **Open Terminal**: In VS Code, go to **Terminal -> New Terminal**.
3.  **Run Install Command**: Type the following and press Enter:
    ```bash
    npm install
    ```
    *This will create a `node_modules` folder and fix all errors in VS Code.*

## Build Steps (To make .exe)

1. **Generate the .exe File**:
   In the same terminal, run:
   ```bash
   npm run make
   ```

2. **Find your Executable**:
   - Once finished, a folder named `out` will appear.
   - Go to: `out/make/squirrel.windows/x64/`
   - Use `NewJehlumGoldSmith-1.0.0-setup.exe` to install it.

## Offline Support
By running `npm install` and building the app this way, all libraries (React, Lucide, etc.) are included inside the `.exe`. Your app will now work **without internet** in your shop.