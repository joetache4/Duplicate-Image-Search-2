const allClusters = document.getElementById("clusters");
const progressBar = document.getElementById("progress-bar-inner");
const thumbnailQuality    = 60;
const thumbnailMaxDim     = 160;
const thumbnailOversample = 2;

const State = {
	isMouseDown        : false,
	highlighted        : [],
	highlightDirection : "",
}

window.api.receive("searchBegun", () => {
	console.log("search started");

	updateUISearchStarted();
});

window.api.receive("cancelSearch", () => {
	console.log("pending search cancelled");

	reloadPage();
});

window.api.receive("updateProgress", (n, filecount, clusterCount) => {
	updateUIProgress(n, filecount, clusterCount);
});

window.api.receive("duplicateFound", (ifile) => {
	updateUIDuplicateFound(ifile);
});

window.api.receive("endSearch", (supportedImgCount, filecount, clusterCount) => {
	console.log("search ended");
	console.log("total files: " + filecount);
	console.log("supported images: " + supportedImgCount);
	console.log("clusters found: " + clusterCount);

	updateUISearchDone(supportedImgCount, filecount, clusterCount);
});










function pendingSearch(dragged = null) {
	console.log("search pending");

	updateUISearchPending();

	window.api.send("pendingSearch", [
		document.getElementById("fast-option").checked,
		thumbnailQuality,
		thumbnailMaxDim,
		thumbnailOversample,
		dragged,
	]);
}

function copyToClipboard(text) {
	navigator.clipboard.writeText(text);
	document.getElementById("message").textContent = "Copied to clipboard!";
	document.getElementById("message").classList.remove("hidden");
	setTimeout(function() {
		document.getElementById("message").classList.add("hidden");
	}, 1000);
}

function updateText(element, text) {
	document.querySelector(element).textContent = text;
}

function createChildDiv(className, parent) {
	const element = document.createElement("div");
	element.className = className;
	parent.appendChild(element);
	return element;
}

function createChildSpan(className, parent) {
	const element = document.createElement("span");
	element.className = className;
	parent.appendChild(element);
	return element;
}

function formatDate(d){
	return d.getFullYear() + "." + (d.getMonth()+1).toString().padStart(2, "0") + "." + d.getDate().toString().padStart(2, "0");
}

function updateLocalStorage() {
	localStorage.setItem("fast-option", document.getElementById("fast-option").checked);
	return;
}

function updateUIOptions() {
	if (localStorage.getItem("fast-option") == null) {
		document.getElementById("fast-option").checked = true;
		return;
	}
	if (localStorage.getItem("fast-option") == "false") {
		document.getElementById("fast-option").checked = false;
	} else {
		document.getElementById("fast-option").checked = true;
	}
	return;
}

function clickCheckbox(event) {
	if (event.target.tagName != 'INPUT') {
		document.getElementById('fast-option').click();
	}
}

function updateUISearchPending() {
	setTimeout(() => {
		document.getElementById("cancel-button").classList.remove("hidden");
		document.getElementById("select-button").classList.add("hidden");
		document.getElementById("spinner").classList.remove("hidden");
	}, 500); // start after the file picker is displayed
}

function updateUISearchStarted() {
	document.getElementById("spinner").classList.add("hidden");
	document.querySelector(".options-page").classList.add("hidden");
	document.querySelector(".header").classList.remove("hidden");
	allClusters.classList.remove("hidden");
}

function updateUIProgress(n, filecount, clusterCount) {
	let s = "s";
	if (clusterCount == 1) {
		s = "";
	}
	updateText(".progress-text", "Please wait... Reading file ".concat(n, " of ", filecount, ". Found ", clusterCount, " cluster", s, " so far."));
	let pct = Math.floor(100 * n / filecount);
	if (pct < 5) {
		pct = 5;
	}
	progressBar.style.width = "".concat(pct, "%");
}

function updateUIDuplicateFound(ifile) {
	console.log("" + (ifile.clusterID+1) + " <- " + ifile.path);

	let divClusterImgs = document.querySelectorAll(".cluster-imgs")[ifile.clusterID];
	let divClusterInfo = document.querySelectorAll(".cluster-info")[ifile.clusterID];

	if (divClusterImgs === undefined) {
		const a = createChildDiv("cluster", allClusters);
		const b = createChildDiv("cluster-num", a);
		b.textContent = ifile.clusterID + 1;
		const c = createChildDiv("cluster-content", a);
		divClusterImgs = createChildDiv("cluster-imgs", c);
		divClusterInfo = createChildDiv("cluster-info", c);
		b.addEventListener("click", () => {
			c.classList.toggle("hidden");
		});
		State.highlighted.push(0);
	}

	const divImg = createChildDiv("div-img", divClusterImgs);
	const thumb = new Image();
	thumb.classList.add("cluster-img");
	thumb.title = ifile.path;
	divImg.appendChild(thumb);
	const divImgDims = createChildDiv("image-dims", divImg);
	divImg.ondragstart = function() { return false; };

	divImgDims.textContent = "".concat(ifile.width, "×", ifile.height);
	thumb.width  = ifile.thumbw;
	thumb.height = ifile.thumbh;
	thumb.src    = ifile.thumbdata;

	const divImgInfo = createChildDiv("img-info", divClusterInfo);
	const divImgSize = createChildSpan("img-info-part size", divImgInfo);
	const divImgDate = createChildSpan("img-info-part date", divImgInfo);
	const divImgPath = createChildSpan("img-info-part path", divImgInfo);
	divImgSize.textContent = parseInt(ifile.size/1024);
	divImgDate.textContent = formatDate(new Date(ifile.mtime));
	divImgPath.textContent = ifile.relpath;

	mouseOverFunc = (event) => {
		const clusterNum = document.querySelectorAll(".cluster-num")[ifile.clusterID];
		divImgInfo.classList.add("hovered");
		divImg.classList.add("hovered");
		if (State.isMouseDown) {
			if (divImgInfo.classList.contains("highlighted")) {
				if (State.highlightDirection !== "adding") {
					divImgInfo.classList.remove("highlighted");
					divImg.classList.remove("highlighted");
					State.highlightDirection = "removing";
					State.highlighted[ifile.clusterID]--;
					clusterNum.classList.remove("all-selected");
					if (State.highlighted[ifile.clusterID] == 0) {
						clusterNum.classList.remove("some-selected");
					}
				}
			} else {
				if (State.highlightDirection !== "removing") {
					divImgInfo.classList.add("highlighted");
					divImg.classList.add("highlighted");
					State.highlightDirection = "adding";
					State.highlighted[ifile.clusterID]++;
					clusterNum.classList.add("some-selected");
					if (State.highlighted[ifile.clusterID] == divClusterImgs.children.length) {
						clusterNum.classList.add("all-selected");
					}
				}
			}
		}
	}
	mouseOutFunc = (event) => {
		divImgInfo.classList.remove("hovered");
		divImg.classList.remove("hovered");
	}
	mouseDownFunc = (event) => {
		const clusterNum = document.querySelectorAll(".cluster-num")[ifile.clusterID];
		if (event.ctrlKey) {
			event.stopPropagation();
			window.api.send("openFileLocation", ifile.path);
		} else {
			divImgInfo.classList.toggle("highlighted");
			divImg.classList.toggle("highlighted");
			if (divImgInfo.classList.contains("highlighted")) {
				State.highlightDirection = "adding";
				State.highlighted[ifile.clusterID]++;
				clusterNum.classList.add("some-selected");
				if (State.highlighted[ifile.clusterID] == divClusterImgs.children.length) {
					clusterNum.classList.add("all-selected");
				}
			} else {
				State.highlightDirection = "removing";
				State.highlighted[ifile.clusterID]--;
				clusterNum.classList.remove("all-selected");
				if (State.highlighted[ifile.clusterID] == 0) {
					clusterNum.classList.remove("some-selected");
				}
			}
		}
	}
	divImgInfo.addEventListener("mouseover", mouseOverFunc);
	divImg.addEventListener("mouseover", mouseOverFunc);
	divImgInfo.addEventListener("mouseout", mouseOutFunc);
	divImg.addEventListener("mouseout", mouseOutFunc);
	divImgInfo.addEventListener("mousedown", mouseDownFunc);
	divImg.addEventListener("mousedown", mouseDownFunc);

	let parts = divClusterInfo.querySelectorAll(".img-info-part.size");
	let bestPart = null, bestVal = 0, val = null;
	parts.forEach((part) => {
		val = parseInt(part.textContent);
		if (val > bestVal) {
			bestVal = val;
			bestPart = part;
		}
		part.classList.remove("best-part");
	});
	parts.forEach((part) => {
		val = parseInt(part.textContent)
		if (val == bestVal) {
			part.classList.add("best-part");
		}
	});

	parts = divClusterInfo.querySelectorAll(".img-info-part.date");
	bestPart = null, bestVal = new Date(0), val = null;
	parts.forEach((part) => {
		val = new Date(part.textContent);
		if (val > bestVal) {
			bestVal = val;
			bestPart = part;
		}
		part.classList.remove("best-part");
	});
	parts.forEach((part) => {
		val = new Date(part.textContent)
		if (val.getTime() === bestVal.getTime()) {
			part.classList.add("best-part");
		}
	});

	parts = divClusterInfo.querySelectorAll(".img-info-part.path");
	parts.forEach((part) => {
		if (part.textContent.endsWith(".png")) {
			part.classList.add("best-part");
		}
	});
};

function updateUISearchDone(supportedImgCount, filecount, clusterCount) {
	document.getElementById("button-pause-search").classList.add("hidden");
	const progress = document.querySelector(".progress");
	progress.removeChild(progress.querySelector(".progress-bar"));
	let s = "s", s2 = "s";
	if (supportedImgCount == 1) {
		s = "";
	}
	if (clusterCount == 1) {
		s2 = "";
	}
	updateText(".progress-text", "Successfully scanned ".concat(supportedImgCount, " file", s, ". Found ", clusterCount, " cluster", s2, "."));
	if (clusterCount == 0) {
		updateText(".progress-text", "Zero similar images found from the successfully scanned ".concat(supportedImgCount, " file", s, "."));
		if (supportedImgCount < 2) {
			document.getElementById("message").textContent = "The selected folder does not contain at least 2 images of supported types. Images must be JPG, PNG, GIF, WEBP, or BMP files less than 40 MB in size.";
		} else {
			document.getElementById("message").textContent = "No duplicates found.";
		}
		document.getElementById("message").classList.remove("hidden");
		allClusters.classList.add("hidden");
	}
}

function togglePause() {
	if (document.getElementById("button-pause-search").textContent == "Pause") {
		document.getElementById("button-pause-search").textContent = "Resume";
		window.api.send("pauseSearch");
	} else {
		document.getElementById("button-pause-search").textContent = "Pause";
		window.api.send("resumeSearch");
	}
}

function reloadPage() {
	location.reload();
	State.isMouseDown = false;
	State.highlighted = 0;
	State.highlightDirection = ""; // TODO not sure I need to manually reset these
	window.api.send("cancelSearch");
}

function showAllList() {
	let text = "";
	for (let cluster of allClusters.querySelectorAll(".cluster")) {
		let paths = cluster.querySelectorAll(".path");
		if (paths.length) {
			for (let path of paths) {
				text = text.concat(path.textContent, "\n");
			}
			text = text.concat("\n");
		}
	}
	text = text.trimEnd();

	document.querySelector(".textarea").value = text;
	toggleList();
}

function showHighlightedList() {
	let text = "";
	for (let cluster of allClusters.querySelectorAll(".cluster")) {
		let paths = cluster.querySelectorAll(".highlighted.img-info > .path");
		if (paths.length) {
			for (let path of paths) {
				text = text.concat(path.textContent, "\n");
			}
			text = text.concat("\n");
		}
	}
	text = text.trimEnd();

	document.querySelector(".textarea").value = text;
	toggleList();
}

function toggleList() {
	document.querySelector(".textarea").classList.toggle("textareaon");
	document.getElementById("show-all-button").classList.toggle("hidden");
	document.getElementById("show-high-button").classList.toggle("hidden");
	document.getElementById("close-button").classList.toggle("hidden");
	document.getElementById("copy-button").classList.toggle("hidden");
	document.getElementById("save-button").classList.toggle("hidden");
}

function copyListToClipboard() {
	copyToClipboard(document.querySelector(".textarea").value);
}

function downloadList() {
	const data = document.querySelector(".textarea").value;
	const filename = `selected-duplicates-${formatDate(new Date())}.txt`;
	const type = "text/plain";
	const file = new Blob([data], {type: type});
		if (window.navigator.msSaveOrOpenBlob) // IE10+
			window.navigator.msSaveOrOpenBlob(file, filename);
	else { // Others
		const a = document.createElement("a"),
		url = URL.createObjectURL(file);
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		setTimeout(function() {
			document.body.removeChild(a);
			window.URL.revokeObjectURL(url);
		}, 0);
	}
}

window.addEventListener("DOMContentLoaded", () => {
	updateUIOptions();
	window.scrollTo({top: 0});

	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape" && document.querySelector(".textarea").classList.contains("textareaon")) {
			toggleList();
		}
	});
});

document.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
});

document.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();

    let paths = [];
    for (const f of event.dataTransfer.files) {
        console.log("Dragged file: ", f.path)
        paths.push(f.path);
    }
    pendingSearch(paths);
});

document.addEventListener("mousedown", () => {
	State.isMouseDown = true;
});

document.addEventListener("mouseup", () => {
	State.isMouseDown = false;
	State.highlightDirection = "";
});
