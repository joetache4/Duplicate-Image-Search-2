/**
 * @file path-sort.js
 * @author Joe Walter <1817@duck.com>
 * @date 2024-08-23
 *
 * This file provides functionality for sorting filesystem paths in an intuitve order.
 */



class PathSort {

	/**
	 * Sorts filesystem paths in a intuitive manner by first comparing path depth, then file names in a locale-aware order. Numbered file names are ordered based on a whole parsing of the number, not simply lexicographically. RTL languages are supported as long as they are written with proper RLM characters.
	 *
	 * The path separator is assumed to be forward-slash ('/'). Paths are assumed not to end with forward-slash.
	 *
	 * @param {string} a - The first path to compare.
	 * @param {string} b - The second path to compare.
	 *
	 * @returns {number} Returns -1 if path a comes before path b, 1 if path b comes before path a, 0 if the two paths are the same.
	 */
	static compare(a, b) {

		function countChar(str, char) {
			let count = 0;
			for (let i = 0; i < str.length; i++)
				if (str[i] === char)
					count++;
			return count;
		}

		let val = countChar(a, "/") - countChar(b, "/");
		if (val) return val;

		const lang = typeof navigator !== "undefined" ? navigator.language : "en-US";
		const opts = {
			numeric : true,
		}

		const aParts = a.replaceAll(/(?<=.)(?<![/.])\./g, "/").split("/");
		const bParts = b.replaceAll(/(?<=.)(?<![/.])\./g, "/").split("/");

		for (let i = 0; i < aParts.length; i++) {
			val = aParts[i].localeCompare(bParts[i], lang, opts);
			if (val) return val;
		}
		
		return a.length - b.length;
	}
}

const isNode = typeof module !== "undefined" && module.exports;
if (isNode) {
	exports.compare = PathSort.compare;
}
