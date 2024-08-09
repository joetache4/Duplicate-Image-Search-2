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
            let validChannels = ["pendingSearch", "pauseSearch", "resumeSearch", "cancelSearch", "openFileLocation"];
            if (validChannels.includes(channel)) {
                ipcRenderer.send(channel, data);
            }
        },
		// main -> renderer
        receive: (channel, func) => {
            let validChannels = ["startSearch", "cancelPendingSearch", "updateProgress", "duplicateFound", "endSearch"];
            if (validChannels.includes(channel)) {
                // Deliberately strip event as it includes `sender`
                ipcRenderer.on(channel, (event, ...args) => func(...args));
            }
        }
    }
);