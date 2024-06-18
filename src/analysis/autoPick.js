// const { Dataset } = require("../../DataTransformer");
// const { zScore, cumulativeStdNormalProbability } = require("simple-statistics");
const ss = require("simple-statistics");
const { setPath, getPath } = require("../lib/util");

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
  let i = low - 1;

  for (let j = low; j <= high - 1; j++) {
    // If current element is smaller
    // than the pivot
    if (arr[j.averageScore()] < pivot) {
      // FIXME j.average score is a temporary

      // Increment index of
      // smaller element
      i++;
      swap(arr, i, j);
    }
  }
  swap(arr, i + 1, high);
  return i + 1;
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
  quickSort(teams, 0, teams - 1);
  return teams;
}
//-------------------------------------------------------------------------------------------------------------------------------------//

// async function fetchDataset() {
// 	return await fetch("./api/dataset").then(res => res.json())
// }
// let dataset = fetchDataset();

// async function fetchTeams() {
// 	const teams = await fetch(`/analysis/api/teams`).then(res => res.json())
// 	return teams.reduce((acc, t) => {
// 		acc[t.team_number] = t.nickname
// 		return acc
// 	}, {})
// }
/**
 *
 * @param {A list of all teams} teams
 * @returns A list of all possible alliances, not including including impossible allaicnes(duplicate teams on an alliance)
 * returns an array of length (teams choose 3)
 */
function possibleAlliances(teams) {
  let alliances = []; // an array of all possible alliances
  /*
	console.log("Possible alliances teams: ")
	console.log(teams)
	*/
  for (let x = 0; x < teams.length; x++) {
    if (!alliances.includes(teams[x])) {
      alliances.push([teams[x]]);
    }
  }

  // for(let x = 0; x < teams.length; x++) {
  // 	for(let y = 0; y < teams.length; y++) {
  // 		for(let z = 0; z < teams.length; z++) { // makes sure there aren't alliances with duplicate teams
  // 			if(teams[x].robotNumber!=teams[y].robotNumber && teams[y].robotNumber!=teams[z].robotNumber && teams[z].robotNumber!=teams[x].robotNumber){
  // 				/*
  // 				console.log("adding alliance: ")
  // 				console.log(teams[x].robotNumber)
  // 				console.log(teams[y].robotNumber)
  // 				console.log(teams[z].robotNumber)
  // 				*/
  // 				let validAlliance = true;
  // 				alliances.forEach(alliance=> // make sure we don't add the same alliance twice
  // 					{
  // 						let teams_matching = 0;
  // 						alliance.forEach(team => {if (team.robotNumber == teams[x].robotNumber ||
  // 							team.robotNumber == teams[y].robotNumber ||
  // 							team.robotNumber == teams[z].robotNumber)
  // 								{teams_matching++}
  // 						})
  // 						if(teams_matching == 3){
  // 							validAlliance = false;
  // 						}
  // 					})

  // 				if(validAlliance){alliances.push([teams[x], teams[y], teams[z]])
  // 				}
  // 			}

  // 		}
  // 	}
  // }
  return alliances;
}
/**
 *
 * @param {An alliance of three teams} alliance
 * @returns the average score for an alliance
 */
function allianceAverage(alliance) {
  return (
    alliance[0].averageScores.total +
    alliance[1].averageScores.total +
    alliance[2].averageScores.total
  );
}

/**
 *
 * @param {An alliance of three teams} alliance
 * @returns the standard deveiation of an alliances score
 */
function allianceStandardDeviation(alliance) {
  let i =
    Math.pow(alliance[0].standardDeviation, 2) +
    Math.pow(alliance[1].standardDeviation, 2) +
    Math.pow(alliance[2].standardDeviation, 2);
  return Math.sqrt(i);
}
/**
 *
 * @param {An alliance of three teams} alliance1
 * @param {An alliance of three teams} alliance2
 * @returns the average difference in score between two alliances, a postive number means on average alliance 1 wins
 */
function matchAverage(alliance1, alliance2) {
  let alliance1Avg = 0;
  //console.log("alliance1")
  //console.log(alliance1);
  for (let a = 0; a < alliance1.length; a++) {
    data = getPath(alliance1[a], "avgTotalPoints", 0);
    alliance1Avg += data;
  }
  let alliance2Avg = 0;
  for (let a = 0; a < alliance2.length; a++) {
    data = getPath(alliance2[a], "avgTotalPoints", 0);
    alliance2Avg += data;
  }
  return alliance1Avg - alliance2Avg;
}

/**
 *
 * @param {An alliance of three} alliance
 * @returns the the standard deveation in the difference of the score between two alliances
 */
function matchStandardDeviation(alliance1, alliance2) {
  let alliance1SD = 0;
  for (let a = 0; a < alliance1.length; a++) {
    data = getPath(alliance1[a], "standardDeviation", 0);
    alliance1SD += Math.pow(data, 2);
  }
  alliance1SD = Math.sqrt(alliance1SD);
  alliance2SD = 0;
  for (let a = 0; a < alliance2.length; a++) {
    data = getPath(alliance2[a], "standardDeviation", 0);
    alliance2SD += Math.pow(data, 2);
  }
  alliance2SD = Math.sqrt(alliance2SD);
  return Math.sqrt(Math.pow(alliance1SD, 2) + Math.pow(alliance2SD, 2));
}
/**
 *
 * @param {*} alliance1
 * @param {*} alliance2
 * @returns the probiblity that alliance 1 wins a random match between the two alliances
 */
function compareAlliances(alliance1, alliance2) {
  zscore = ss.zScore(
    0,
    matchAverage(alliance1, alliance2),
    matchStandardDeviation(alliance1, alliance2)
  );
  probAlliance2Wins = ss.cumulativeStdNormalProbability(zscore);
  return 1 - probAlliance2Wins;
}
/**
 *
 * @param {a list of teams} all of the teams
 * If we compare to every alliances to every other alliances we can make a (key, value) map with a key of the alliance number and a value of their winning prob
 * Then it can be passed into another (key, value) map with the key being a team number and a value of their average chance of winning
 */
function compareAllTeams(teams) {
  // Algorithm:
  // create list of all alliances using possibleAlliances(teams) function, this is a set of sets that needs
  // 		to be converted to an array of arrays
  // compare each alliance to every other alliance and keep a running probability (sum of every probability),
  // 		average this probability at the end for each alliance.
  // loop through each alliance, add average probability to each team, average this at the end
  //    so each team has a value of their average chance of winning in any given alliance

  //console.log("ran compare all teams");
  //console.log("teams: ")
  //console.log(teams)
  let alliancesWithScore = []; // an array of arrays; Within each list contains an alliance, sum of probabilities, number of alliances compared with, and avg probability
  let alliances = possibleAlliances(teams); // an array of arrays (all possible alliances)
  //let iterator = possibleAlliances(teams).values();  // an iterator that goes through all possible alliances
  //console.log("possibleAlliances")
  //console.log(possibleAlliances(teams))
  for (let i = 0; i < alliances.length; i++) {
    // sumProbability is the total, probability = sumProbability / teamsComparedWith
    //console.log(allianceValue);
    //console.log(alliances[i])
    alliancesWithScore[i] = {
      alliance: alliances[i],
      probability: 0,
      sumProbability: 0,
      teamsComparedWith: 0,
    };
  }
  //console.log("alliancesWithScore")
  //console.log(alliancesWithScore)
  for (let i = 0; i < alliancesWithScore.length; i++) {
    // use compareAlliances function to compare all the alliances with each other
    for (let j = i + 1; j < alliancesWithScore.length; j++) {
      // make sure we don't compare alliances that use the same team
      let validAlliances = true;
      alliancesWithScore[i].alliance.forEach((team) => {
        if (alliancesWithScore[j].alliance.includes(team)) {
          /*
					console.log("team: ")
					console.log(team)
					console.log(" is in both alliances")
					console.log(alliancesWithScore[i])
					console.log(alliancesWithScore[j])
					*/
          validAlliances = false;
        }
      });
      //console.log("validAlliances: " + validAlliances)
      if (validAlliances) {
        //console.log("ran compareAlliances")
        alliancesWithScore[i].sumProbability += compareAlliances(
          alliancesWithScore[i].alliance,
          alliancesWithScore[j].alliance
        );
        alliancesWithScore[i].teamsComparedWith++;
        alliancesWithScore[j].sumProbability += compareAlliances(
          alliancesWithScore[j].alliance,
          alliancesWithScore[i].alliance
        );
        alliancesWithScore[j].teamsComparedWith++;
      }
    }
    alliancesWithScore[i].probability =
      alliancesWithScore[i].sumProbability /
      alliancesWithScore[i].teamsComparedWith;
    //console.log("alliance Probability: "+i+" "+alliancesWithScore[i].probability)
  }

  // take average of this total for each team - average probability of this team winning
  // sort teams by probability of winning
  for (let i = 0; i < teams.length; i++) {
    setPath(teams[i], "avgProbability", 0);
    setPath(teams[i], "alliancesComparedWith", 0);
  }
  //console.log("alliance with score length" + alliancesWithScore.length)
  for (
    let allianceNum = 0;
    allianceNum < alliancesWithScore.length;
    allianceNum++
  ) {
    for (
      let team = 0;
      team < alliancesWithScore[allianceNum].alliance.length;
      team++
    ) {
      // access each team on the alliance
      //console.log("team that probability is added to: ")
      //console.log(alliancesWithScore[allianceNum].alliance[team])
      alliancesWithScore[allianceNum].alliance[team].avgProbability +=
        alliancesWithScore[allianceNum].probability;
      alliancesWithScore[allianceNum].alliance[team].alliancesComparedWith++;
    }
  }
  for (let teamNum = 0; teamNum < teams.length; teamNum++) {
    teams[teamNum].avgProbability =
      teams[teamNum].avgProbability / teams[teamNum].alliancesComparedWith;
  }
}

module.exports = compareAllTeams;

//----------------------------------------------------------------------------------------------------------------------------------//
// let dataset = fetchDataset();
// let teams = fetchTeams();
// console.log(teams);
// let pAliiances = possibleAliiances(teams);
// console.log(pAliiances);
//console.log("test")

let teamB1 = {
  sd: 20,
  avg: 80,
  team_number: 1,
};

let teamB2 = {
  sd: 20,
  avg: 70,
  team_number: 2,
};

let teamB3 = {
  sd: 20,
  avg: 20,
  team_number: 3,
};

let teamR1 = {
  sd: 20,
  avg: 60,
  team_number: 4,
};

let teamR2 = {
  sd: 20,
  avg: 70,
  team_number: 5,
};

let teamR3 = {
  sd: 20,
  avg: 30,
  team_number: 6,
};

// TESTS -
/*
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

let teams = [teamB1, teamB2, teamB3, teamR1, teamR2, teamR3]
compareAllTeams(teams)
console.log(teamB1.avgProbability) // 0.66152  (avg: 80, sd: 20)
console.log(teamB2.avgProbability) // 0.59114  (avg: 70, sd: 20)
console.log(teamB3.avgProbability) // 0.2696   (avg: 20, sd: 20)
console.log(teamR1.avgProbability) // 0.52532  (avg: 60, sd: 20)
console.log(teamR2.avgProbability) // 0.59114  (avg: 70, sd: 20)
console.log(teamR3.avgProbability) // 0.36126  (avg: 30, sd: 20)

*/
