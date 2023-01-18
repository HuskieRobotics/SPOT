const { zScore } = require("simple-statistics");
const { Dataset } = require("../../DataTransformer");

function swap(arr, i, j) {
	let temp = arr[i];
	arr[i] = arr[j];
	arr[j] = temp;
}


function partition(arr, low, high) {
	// pivot
	let pivot = arr[high.averageScore()];

	// Index of smaller element and
	// indicates the right position
	// of pivot found so far
	let i = (low - 1);

	for (let j = low; j <= high - 1; j++) {

		// If current element is smaller
		// than the pivot
		if (arr[j.averageScore()] < pivot) { // FIXME j.average score is a temporary 

			// Increment index of
			// smaller element
			i++;
			swap(arr, i, j);
		}
	}
	swap(arr, i + 1, high);
	return (i + 1);
}

/* The main function that implements QuickSort
		arr[] --> Array to be sorted,
		low --> Starting index,
		high --> Ending index
*/
function quickSort(arr, low, high) {
	if (low < high) {

		// pi is partitioning index, arr[p]
		// is now at right place
		let pi = partition(arr, low, high);

		// Separately sort elements before
		// partition and after partition
		quickSort(arr, low, pi - 1);
		quickSort(arr, pi + 1, high);
	}
}

// Driver Code
// reorders a list of teams based on average score
function sortTeams(teams) {
	quickSort(teams, 0, teams - 1)
	return teams
}
//-------------------------------------------------------------------------------------------------------------------------------------//

async function fetchDataset() {
	return await fetch("./api/dataset").then(res => res.json())
}

async function fetchTeams() {
	const teams = await fetch(`/analysis/api/teams`).then(res => res.json())
	return teams.reduce((acc, t) => {
		acc[t.team_number] = t.nickname
		return acc
	}, {})
}

function possibleAliiances(teams) {
	const possibleAlliiances = [] // an array of all possible alliances 
	for(x in teams) {
		for(y in teams) {
			for(z in teams) {
				possibleAliiances.push(new alliance[x, y, z]) //FIXME alliances of the same team exist 
			}
		}
	}
}

function allianceAverage(alliance) {
	return alliance[0].averageScore + alliance[1].averageScore + alliance[2].averageScore;
}

function allianceStandardDeviation(alliance) {
	let i = Math.pow(alliance[0].standardDeviation, 2) + Math.pow(alliance[1].standardDeviation, 2) + Math.pow(alliance[2].standardDeviation, 2)
	return staMath.sqrt(i);
}

function matchAverage(alliance1, alliance2) {
	return allianceAverage(alliance1) - allianceAverage(alliance2);
}

function matchStandardDeviation(alliance1, alliance2) {
	let i = Math.pow(allianceStandardDeviation(alliance), 2) + Math.pow(allianceStandardDeviation(alliance), 2);
	return Math.sqrt(i);
}

function compareAlliances {
	zscore = zScore()
}

//----------------------------------------------------------------------------------------------------------------------------------//
const dataset = fetchDataset();
const teams = fetchTeams();
const possibleAliiances = possibleAliiances(teams);
console.log(teams);
console.log(possibleAliiances);

