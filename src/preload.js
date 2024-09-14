const {
    contextBridge,
    ipcRenderer
} = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
    "api", {
		// renderer -> main
        send: (channel, data) => {
            // whitelist channels
            let validChannels = ["startSearch", "pauseSearch", "resumeSearch", "cancelSearch", "openFileLocation"];
            if (validChannels.includes(channel)) {
                ipcRenderer.send(channel, data);
            }
        },
		// main -> renderer
        receive: (channel, func) => {
            let validChannels = ["searchBegun", "cancelSearch", "updateProgress", "duplicateFound", "endSearch"];
            if (validChannels.includes(channel)) {
                // Deliberately strip event as it includes `sender`
                ipcRenderer.on(channel, (event, ...args) => func(...args));
            }
        }
    }
);