const {
	app,
	BrowserWindow,
	Menu,
	dialog,
	ipcMain
} = require("electron");
const {
	exec
} = require("child_process");

const path  = require("path");
const fs    = require("fs");
const sharp = require("sharp");

let mainWindow;
function createWindow () {
	mainWindow = new BrowserWindow({
		width: 1000,
		height: 600,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			nodeIntegration: false,
			contextIsolation: true,
			enableRemoteModule: false,
		},
		icon: path.join(__dirname, "..", "resources", "icon.png"),
	});
	mainWindow.maximize();
	mainWindow.loadFile("src/index.html")

	// open the DevTools
	mainWindow.webContents.openDevTools()

	// open links in an actual browser
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		require("electron").shell.openExternal(url);
		return { action: "deny" };
	});
}

app.whenReady().then(() => {
	Menu.setApplicationMenu(null);
	createWindow();
	app.on("activate", function () {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", function () {
	if (process.platform !== "darwin") app.quit()
});


/////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////// search code //////////////////////////////////////

const State = {
	paused    : false,
	canceled  : false,
};

const Config = {
	fastRead            : false, // TODO currently not implemented
	thumbnailQuality    : null,
	thumbnailMaxDim     : null,
	thumbnailOversample : null,
};

const Results = {
	filecount         : 0,
	clusters          : [],
	clusterCount      : 0,
	supportedImgCount : 0,
};

ipcMain.on("startSearch", (event, args) => {
	Config.fastRead            = args[0];
	Config.thumbnailQuality    = args[1];
	Config.thumbnailMaxDim     = args[2];
	Config.thumbnailOversample = args[3];

	const dragged              = args[4];

	new Promise((resolve, reject) => {
		if (dragged !== null && dragged.length) {
			resolve(dragged);
		} else {
			dialog.showOpenDialog({
				properties: ['openDirectory']
			})
			.then(result => {
				if (result.canceled) {
					reject("File selection canceled.");
				} else {
					resolve(result.filePaths);
				}
			})
		}
	})
	.then(inputPaths => {
		allImageFiles = [];
		inputPaths.forEach(filePath => {
			console.log("input: " + filePath);
			getImageFilesRecursive(filePath, path.dirname(filePath), allImageFiles);
		});
		allImageFiles.sort((a,b) => {
			const d = a.depth - b.depth;
			if (d) return -d;
			return -a.relpath.localeCompare(b.relpath); // negative b/c items will be popped from the back
		});

		Results.filecount         = allImageFiles.length;
		Results.clusters.length   = 0;
		Results.clusterCount	  = 0;
		Results.supportedImgCount = 0;

		State.paused   = false;
		State.canceled = false; // TODO if the user is quick enough, callbacks from a previous search may still be in the queue

		mainWindow.webContents.send("searchBegun");

		processNext(allImageFiles);
	})
	.catch(err => {
		console.log(err);
		mainWindow.webContents.send("cancelSearch");
	});
});

ipcMain.on("pauseSearch", (event, args) => {
	State.paused = true;
});

ipcMain.on("resumeSearch", (event, args) => {
	State.paused = false;
});

ipcMain.on("cancelSearch", (event, args) => {
	State.paused   = false;
	State.canceled = true;
});

ipcMain.on("openFileLocation", (event, path) => {
	openFileBrowser(path);
});

class ImageFile {
	static formats           = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];

	static maxFileSize       = 40*1024*1024;

	static iconDim           = 11;   // Images will be processed into icons of this side length

	static ratioTolerancePct = 10;
	static acceptLumaDist    = 2;    // Images will be considered similar if there luma distance is within this threshold
	static rejectLumaDist    = 500;  // Images will be considered distinct if there luma distance is outside this threshold
	static rejectChromaDist  = 1000; // Images will be considered distinct if there chroma distance is outside this threshold
									 // Otherwise, Images are considered similar

	static {
		// Images will be treated as grids of "blocks", each containing "cells". Each cell is a pixel.
		ImageFile.iconArea = ImageFile.iconDim ** 2;
		ImageFile.blockDim = 2 * ImageFile.iconDim + 1;
		ImageFile.cellDim  = ImageFile.iconDim + 1;

		if ((ImageFile.blockDim-2)%3 != 0) {
			throw new Error("Invalid iconDim");
		}

		ImageFile.canvasDim = ImageFile.blockDim * ImageFile.cellDim; // Images will be loaded as squares with this side length

		ImageFile.acceptLumaDist   *= ImageFile.iconArea;
		ImageFile.rejectLumaDist   *= ImageFile.iconArea;
		ImageFile.rejectChromaDist *= ImageFile.iconArea;
	}

	constructor(filePath) {
		this.path      = filePath;
		this.relpath   = null;
		this.depth     = filePath.split(path.sep).length - 1;
		this.size      = null;
		this.type      = path.extname(filePath).toLowerCase().substring(1);
		this.mtime     = null;
		this.val       = null;
		this.width     = null;
		this.height    = null;
		this.icondata  = null;
		this.thumbdata = null;
		this.thumbw    = null;
		this.thumbh    = null;
		this.clusterID = null;
	}

	valid() {
		if (this.val === null) {
			this.val = ImageFile.formats.includes(this.type) && this.size <= ImageFile.maxFileSize;
		}
		return this.val;
	}

	async load() {
		const image    = await sharp(this.path);
		const metadata = await image.metadata();

		this.width     = metadata.width;
		this.height    = metadata.height;

		return image
			.removeAlpha()
			.resize({ fit   : "fill",
					  width : ImageFile.canvasDim,
					  height: ImageFile.canvasDim })
			.raw()
			.toBuffer()
			.then(function(buffer) {
				this.icondata = ImageFile.icon(buffer);
			}.bind(this));
	}

	static icon(buffer) {
		let data = buffer;
		data = ImageFile.boxBlur(data, ImageFile.canvasDim, ImageFile.canvasDim, ImageFile.cellDim, ImageFile.cellDim);
		data = ImageFile.boxBlur(data, ImageFile.blockDim, ImageFile.blockDim, 3, 2);
		data = ImageFile.rgbaToYcbcr(data);
		data = [ImageFile.normalize(data[0]), ImageFile.normalize(data[1]), ImageFile.normalize(data[2])];
		return data;
	}

	static rgbaToYcbcr(data, channelsIn=3) {
		// see ITU-T T.871
		const YBR = [[], [], []];
		let r = 0, g = 0, b = 0;

		for (let i = 0; i < ImageFile.iconArea; i++) {
			r = data[channelsIn*i	 ];
			g = data[channelsIn*i + 1];
			b = data[channelsIn*i + 2];
			YBR[0][i] =	   0.2990000000 * r + 0.5870000000 * g + 0.1140000000 * b;
			YBR[1][i] = 128 - 0.1687358916 * r - 0.3312641084 * g + 0.5000000000 * b;
			YBR[2][i] = 128 + 0.5000000000 * r - 0.4186875892 * g - 0.0813124108 * b;
		}

		return YBR;
	}

	static boxBlur(data, width, height, windowDim, shift, channelsIn=3) {
		const blurredData = new Array(data.length);
		const destDim = parseInt((width-windowDim)/shift) + 1;
		const n = windowDim ** 2;
		let sumR = 0, sumG = 0, sumB = 0;
		let i = 0, j = 0;

		for (let shiftRow = 0; shiftRow <= width-windowDim; shiftRow += shift) {
			for (let shiftCol = 0; shiftCol <= height-windowDim; shiftCol += shift) {
				sumR = 0, sumG = 0, sumB = 0;
				for (let row = 0; row < windowDim; row++) {
					for (let col = 0; col < windowDim; col++) {
						i = channelsIn * ((row + shiftRow) * width + (col + shiftCol));
						sumR += data[i	  ];
						sumG += data[i + 1];
						sumB += data[i + 2];
					}
				}
				blurredData[j	] = sumR / n;
				blurredData[j + 1] = sumG / n;
				blurredData[j + 2] = sumB / n;
				j += channelsIn;
			}
		}

		return blurredData;
	}

	static normalize(vals) {
		let max  = 0;
		let min  = Number.POSITIVE_INFINITY;
		for (let i = 0; i < vals.length; i++) {
			if (vals[i] > max) {
				max = vals[i];
			} else if (vals[i] < min) {
				min = vals[i];
			}
		}

		let norm = null;
		let range = max - min;
		if (range < 0.00001) {
			norm = new Array(vals.length).fill(vals[0]);
		} else {
			norm = vals.map(val => (val - min) * 255 / range);
		}
		return norm;
	}

	similar(other) {
		const icon1 = this.icondata, icon2 = other.icondata;
		const w1 = this.width, w2 = other.width;
		const h1 = this.height, h2 = other.height;

		let dist  = 0;

		// abs(ratio1 - ratio2) > tol% * max(ratio1, ratio2)  -->  reject
		if (Math.abs(100*h1*w2 - 100*h2*w1) > Math.max(h1*w2, h2*w1) * ImageFile.ratioTolerancePct) {
			return false;
		}

		dist = 0;
		for (let i = 0; i < ImageFile.iconArea; i++) {
			dist += (icon1[0][i] - icon2[0][i]) ** 2;
		}
		if (dist > ImageFile.rejectLumaDist) {
			return false;
		}

		if (dist < ImageFile.acceptLumaDist) {
			return true;
		}

		dist = 0;
		for (let i = 0; i < ImageFile.iconArea; i++) {
			dist += (icon1[1][i] - icon2[1][i]) ** 2;
		}
		if (dist > ImageFile.rejectChromaDist) {
			return false;
		}

		dist = 0;
		for (let i = 0; i < ImageFile.iconArea; i++) {
			dist += (icon1[2][i] - icon2[2][i]) ** 2;
		}
		if (dist > ImageFile.rejectChromaDist) {
			return false;
		}

		return true;
	}

	createThumb() {
		let opts = null;
		if (this.width >= this.height) {
			this.thumbh = Config.thumbnailMaxDim;
			this.thumbw = Math.floor(Config.thumbnailMaxDim * this.width / this.height);
			opts = { fit    : "contain",
					 height : this.thumbh * Config.thumbnailOversample };
		} else {
			this.thumbw = Config.thumbnailMaxDim;
			this.thumbh = Math.floor(Config.thumbnailMaxDim * this.height / this.width);
			opts = { fit   : "contain",
					 width : this.thumbw * Config.thumbnailOversample };
		}
		return sharp(this.path)
			.resize(opts)
			.jpeg({ quality: Config.thumbnailQuality })
			.toBuffer()
			.then(function(buffer) {
				this.thumbdata = `data:image/jpeg;base64,${buffer.toString("base64")}`;
			}.bind(this));
	}
}

function getImageFilesRecursive(filePath, root, arr) {
	let stats;
	try {
		stats = fs.statSync(filePath);
	} catch {
		console.log("*** error accessing file: " + filePath);
		return;
	}
	if (stats.isSymbolicLink()) {
		return;
	}
	else if (stats.isDirectory()) {
		let children;
		try {
			children = fs.readdirSync(filePath);
		} catch {
			console.log("*** error scanning dir: " + filePath);
			return;
		}
		children.forEach(f => {
			getImageFilesRecursive(path.join(filePath, f), root, arr);
		});
	} else if (stats.isFile()) {
		const ifile   = new ImageFile(filePath);
		ifile.relpath = path.relative(root, filePath);
		ifile.size    = stats.size;
		ifile.mtime   = stats.mtime;
		if (ifile.valid()) {
			arr.push(ifile);
		}
	}
}

function processNext(files, scannedFiles=null, n=0) {
	if (State.canceled) {
		return;
	}
	if (!files.length) {
		mainWindow.webContents.send("endSearch", Results.supportedImgCount, Results.filecount, Results.clusterCount);
		return;
	}
	if (State.paused) {
		setTimeout(() => {
			processNext(files, scannedFiles, n);
		}, 1000);
		return;
	}
	if (scannedFiles == null) {
		scannedFiles = [];
	}

	mainWindow.webContents.send("updateProgress", n, Results.filecount, Results.clusterCount);

	let ifile = files.pop();

	Results.supportedImgCount++;

	ifile.load()
		.then(() => {
			if (!State.canceled) {
				searchForMatch(ifile, scannedFiles);
				scannedFiles.push(ifile);
			}
		})
		.catch((err) => {
			console.log("*** error loading " + ifile.path);
			console.log(err);
		})
		.finally(() => {
			if (!State.canceled)
				processNext(files, scannedFiles, n+1);
		});
}

function searchForMatch(ifile, scannedFiles) {
	for (const ifile2 of scannedFiles) {
		if (ifile.similar(ifile2)) {
			groupTogether(ifile, ifile2);
			break;
		}
	}
}

function groupTogether(ifile1, ifile2) {
	const i = ifile1.clusterID;
	const j = ifile2.clusterID;

	let send1 = false, send2 = false;

	if (i == null && j == null) {
		ifile1.clusterID = Results.clusterCount;
		ifile2.clusterID = Results.clusterCount;
		Results.clusters.push([ifile2, ifile1]);
		Results.clusterCount++;
		send1 = true;
		send2 = true;
	}

	else if (typeof i === "number") {
		Results.clusters[i].push(ifile2);
		ifile2.clusterID = i;
		send2 = true;
	}

	else if (typeof j === "number") {
		Results.clusters[j].push(ifile1);
		ifile1.clusterID = j;
		send1 = true;
	}

	if (send2) {
		ifile2.createThumb().then(() => {
			if (!State.canceled) {
				icon2 = ifile2.icondata;
				ifile2.icondata = null;
				mainWindow.webContents.send("duplicateFound", ifile2);
				ifile2.icondata = icon2;
			}
		});
	}
	if (send1) {
		ifile1.createThumb().then(() => {
			if (!State.canceled) {
				icon1 = ifile1.icondata;
				ifile1.icondata = null;
				mainWindow.webContents.send("duplicateFound", ifile1);
				ifile1.icondata = icon1;
			}
		});

	}
}

function openFileBrowser(path) {
	if (process.platform === "win32") {
		exec(`explorer /select,"${path}"`);
	} else if (process.platform === "darwin") {
		exec(`open -R "${path}"`);
	} else if (process.platform === "linux") {
		exec(`xdg-open "${path}"`);
	} else {
		console.error("Unsupported platform");
	}
}
