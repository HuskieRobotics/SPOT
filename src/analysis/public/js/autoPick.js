

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
	
	let possibleAlliiances = new Set() // a set of all possible alliances 
	for(x in teams) {
		for(y in teams) {
			for(z in teams) {
				if(x.team_number!=y.team_number && y.team_number!=z.team_number && z.team_number!=x.team_number){
					possibleAliiances.push(new Set(x, y, z))
				}
				
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
 * @param {a list of teams} all of the teams  
 * @returns a list of pairs (team, value) that is sorted by the value of winning probability
 * If we compare to every alliances to every other alliances we can make a (key, value) map with a key of the alliance number and a value of their winning prob
 * Then it can be passed into another (key, value) map with the key being a team number and a value of their average chance of winning
 */
function compareAllTeams(teams) { 
	// create list of all alliances using possibleAlliances(teams) function
	// compare each alliance to every other alliance and keep a running probability, 
	// average this probability at the end for each alliance
	// loop through each alliance, add average probability to each team, 
	


	let alliances = possibleAliiances(teams);
	let alliancesWithScore = [[]];    // a list of all alliances, that keeps track of their average winning probability
	for(let i = 0; i < alliances.length; i++){ // sumProbability is the total, probability = sumProbability / teamsComparedWith
		alliancesWithScore[i] = {alliance:alliances[i],probability:0,sumProbability:0,teamsComparedWith:0};
	}
	for(let i =0; i <alliancesWithScore.length;i++){
		for(let j = i+1; j < alliancesWithScore.length;j++){
			alliancesWithScore[i].sumProbability += compareAlliances(alliancesWithScore[i].alliance, alliancesWithScore[j].alliance);
			alliancesWithScore[i].teamsComparedWith++;
			alliancesWithScore[j].sumProbability += compareAlliances(alliancesWithScore[j].alliance, alliancesWithScore[i].alliance);
			alliancesWithScore[j].teamsComparedWith++;
		}
		alliancesWithScore[i].probability = alliancesWithScore[i].sumProbability / alliancesWithScore[i].teamsComparedWith;
	}

	// take average of this total for each team - average probability of this team winning
	// sort teams by probability
	//alliancesWithScore[0].alliance[0].avgProbability = 0; 
	//alliancesWithScore[0].alliance[0].alliancesComparedWith = 0;
	for(let i = 0; i < teams.length; i++){
		setPath(teams[i], "avgProbability", 0);
		setPath(teams[i], "alliancesComparedWith", 0);
	}
	for(let allianceNum = 0; allianceNum < alliancesWithScore.length;allianceNum++){ // access each alliance
		for(let team = 0; team <3; team++){ // access each team on the alliance
			alliancesWithScore[allianceNum].alliance[team].avgProbability += alliancesWithScore[alliance].probability;
			alliancesWithScore[allianceNum].alliance[team].alliancesComparedWith++;
		}
	}
	for(let teamNum = 0; teamNum < teams.length; teamNum++){
		teams[teamNum].avgProbability = teams[teamNum].avgProbability / teams[teamNum].alliancesComparedWith;
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

compareAllTeams([teamB1, teamB2, teamB3, teamR1, teamR2, teamR3])
console.log(teamB1.avgProbability)
console.log(teamB2.avgProbability)
console.log(teamB3.avgProbability)
console.log(teamR1.avgProbability)
console.log(teamR2.avgProbability)
console.log(teamR3.avgProbability)