const allClusters = document.getElementById("clusters");
const progressBar = document.getElementById("progress-bar-inner");
const thumbnailQuality    = 60;
const thumbnailMaxDim     = 160;
const thumbnailOversample = 2;

let highlighted = 0;

function searchPending() {
	console.log("search pending");

	document.getElementById("cancel-button").style.display = "inline-block";
	document.getElementById("select-button").style.display = "none";

	window.api.send("pendingSearch", [
		document.getElementById("fast-option").checked,
		thumbnailQuality,
		thumbnailMaxDim,
		thumbnailOversample,
	]);
}

window.api.receive("startSearch", () => {
	console.log("search started");

	document.querySelector(".options-page").style.display = "none";
	document.querySelector(".header").style.display = "block";
	allClusters.style.display = "block";
});

window.api.receive("cancelPendingSearch", () => {
	console.log("pending search cancelled");

	//document.getElementById("cancel-button").style.display = "none";
	//document.getElementById("select-button").style.display = "inline-block";
	reloadPage();
});

window.api.receive("updateProgress", (n, filecount, clusterCount) => {
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
});

window.api.receive("duplicateFound", (ifile) => {
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
	}

	const divImg = createChildDiv("div-img", divClusterImgs);
	const thumb = new Image();
	thumb.classList.add("cluster-img");
	thumb.title = ifile.path;
	divImg.appendChild(thumb);
	const divImgDims = createChildDiv("image-dims", divImg);

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

	// alphabetize images by path name
	tmp = Array.from(divClusterImgs.children)
	tmp.sort((a,b) => {
		textA = a.children[0].title;
		textB = b.children[0].title;
		return textA.localeCompare(textB);
	});
	divClusterImgs.innerHTML = "";
	tmp.forEach(child => divClusterImgs.appendChild(child));

	// alphabetize path names
	tmp = Array.from(divClusterInfo.children)
	tmp.sort((a,b) => {
		textA = a.querySelector(".path").textContent;
		textB = b.querySelector(".path").textContent;
		return textA.localeCompare(textB);
	});
	divClusterInfo.innerHTML = "";
	tmp.forEach(child => divClusterInfo.appendChild(child));

	hoverFunc = () => {
		divImgInfo.classList.toggle("hovered");
		divImg.classList.toggle("hovered");
	}
	clickFunc = (event) => {
		if (event.ctrlKey) {
			window.api.send("openFileLocation", ifile.path);
		} else {
			divImgInfo.classList.toggle("highlighted");
			divImg.classList.toggle("highlighted");
			if (divImgInfo.classList.contains("highlighted")) {
				highlighted++;
			} else {
				highlighted--;
			}
		}
	}
	divImgInfo.addEventListener("mouseover", hoverFunc);
	divImg.addEventListener("mouseover", hoverFunc);
	divImgInfo.addEventListener("mouseout", hoverFunc);
	divImg.addEventListener("mouseout", hoverFunc);
	divImgInfo.addEventListener("click", clickFunc);
	divImg.addEventListener("click", clickFunc);

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
});

window.api.receive("endSearch", (supportedImgCount, filecount, clusterCount) => {
	console.log("search ended");
	console.log("total files: " + filecount);
	console.log("supported images: " + supportedImgCount);
	console.log("clusters found: " + clusterCount);

	document.getElementById("button-pause-search").style.display = "none";
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
		document.getElementById("message").style.display = "block";
		allClusters.style.display = "none";
	}
});










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
	highlighted = 0;
	window.api.send("cancelSearch");
}

function formatDate(d){
	return d.getFullYear() + "." + (d.getMonth()+1).toString().padStart(2, "0") + "." + d.getDate().toString().padStart(2, "0");
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
	const text = document.querySelector(".textarea").value;
	navigator.clipboard.writeText(text);
	document.getElementById("message").textContent = "Copied to clipboard!";
	document.getElementById("message").style.display = "block";
	setTimeout(function() {
		document.getElementById("message").style.display = "none";
	}, 1000);
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