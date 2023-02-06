// const { Dataset } = require("../../DataTransformer");
// const { zScore, cumulativeStdNormalProbability } = require("simple-statistics");

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
/**
 * 
 * @param {A list of all teams} teams 
 * @returns A list of all possible alliances, including impossible allaicnes(duplicate teams on an alliance)
 */
function possibleAliiances(teams) {
	let possibleAlliiances = [] // an array of all possible alliances 
	for(x in teams) {
		for(y in teams) {
			for(z in teams) {
				possibleAliiances.push(new alliance[x, y, z])
			}
		}
	}
	return possibleAliiances
}
/**
 * 
 * @param {An alliance of three teams} alliance 
 * @returns the average score for an alliance 
 */
function allianceAverage(alliance) {
	return alliance[0].avg + alliance[1].avg + alliance[2].avg;
}

/**
 * 
 * @param {An alliance of three teams} alliance 
 * @returns the standard deveiation of an alliances score 
 */
function allianceStandardDeviation(alliance) {
	let i = Math.pow(alliance[0].sd, 2) + Math.pow(alliance[1].sd, 2) + Math.pow(alliance[2].sd, 2)
	return Math.sqrt(i);
}
/**
 * 
 * @param {An alliance of three teams} alliance1 
 * @param {An alliance of three teams} alliance2 
 * @returns the average difference in score between two alliances, a postive number means on average alliance 1 wins
 */
function matchAverage(alliance1, alliance2) {
	return allianceAverage(alliance1) - allianceAverage(alliance2);
}

/**
 * 
 * @param {An alliance of three} alliance 
 * @returns the the standard deveation in the difference of the score between two alliances
 */
function matchStandardDeviation(alliance1, alliance2) {
	let i = Math.pow(allianceStandardDeviation(alliance1), 2) + Math.pow(allianceStandardDeviation(alliance2), 2);
	return Math.sqrt(i);
}
/**
 * 
 * @param {*} alliance1 
 * @param {*} alliance2 
 * @returns the probiblity that alliance 1 wins a random match between the two alliances 
 */

function compareAlliances(alliance1, alliance2) {
	zscore = ss.zScore(0, matchAverage(alliance1, alliance2), matchStandardDeviation(alliance1, alliance2))
	probAlliance2Wins = ss.cumulativeStdNormalProbability(zscore)
	return 1 - probAlliance2Wins;
}
/**
 * 
 * @param {a list of alliances} alliances 
 * @returns a list of alliances prioritized, by winning probability 
 * 
 * If we compare to every alliances to every other alliances we can make a (key, value) map with a key of the alliance number and a value of their winning prob
 * Then it can be passed into another (key, value) map with the key being a team number and a value of their average chance of winning
 */
function compareAllTeams(alliances) {
	let allianceProb = new Map();
	for (a in alliances) {
		for (b in alliances){
			allianceProb.set(alliances.indexOf(a), allianceProb.get(alliances.indexOf(a)) + compareAlliances(a, b))
		}
	}
	//The map now contains a map of all possible alliances and a sum of their change of winning
	for(a in allianceProb){ 
		allianceProb.set(a, allianceProb.get(a) / Math.pow(alliances.length(), 2))
	}
	//Now each alliances value should be their average chance of winning
	let teamProb = new Map();
	for(a in allianceProb){
		
	}

}

//----------------------------------------------------------------------------------------------------------------------------------//

// let dataset = fetchDataset();
// let teams = fetchTeams();
// console.log(teams);
// let pAliiances = possibleAliiances(teams);
// console.log(pAliiances);
console.log("test")

let teamB1 = {
	sd : 20,
	avg: 80
}

let teamB2 = {
	sd : 20,
	avg: 70
}

let teamB3 = {
	sd : 20,
	avg: 20
}

let teamR1 = {
	sd : 20,
	avg: 60
}

let teamR2 = {
	sd : 20,
	avg: 70
}

let teamR3 = {
	sd : 20,
	avg: 30
}

console.log("Blue 1" + teamB1)
console.log("Blue 2" + teamB2)
console.log("Blue 3" + teamB3)

console.log("Red 1" + teamR1)
console.log("Red 2" + teamR2)
console.log("Red 3" + teamR3)


let allianceBlue = [teamB1, teamB2, teamB3]
let allianceRed =[teamR1, teamR2, teamR3]

console.log(allianceBlue)
console.log(allianceRed)



console.log(allianceAverage(allianceBlue))
console.log(allianceAverage(allianceRed))
console.log(allianceStandardDeviation(allianceBlue))
console.log(allianceStandardDeviation(allianceRed))

console.log(compareAlliances(allianceBlue, allianceRed));