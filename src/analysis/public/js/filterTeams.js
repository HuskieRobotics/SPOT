function teamMatchesFilter(team) {
  // Show all teams if no actions OR ratings are selected
  if (
    filterTeamState.selectedActions.size === 0 ||
    filterTeamState.selectedRatings.size === 0
  ) {
    return false;
  }

  for (const action of filterTeamState.selectedActions) {
    const value = team.averageScores?.[action] ?? team.opr?.[action];
    if (!filterTeamState.selectedRatings.has(String(value))) {
      return false;
    }
  }
  return true;
}

function collectFilteredTeams() {
  const filteredTeams = [];
  for (const [teamNumber, team] of Object.entries(dataset.teams)) {
    if (teamMatchesFilter(team)) {
      filteredTeams.push([teamNumber, team]);
    }
  }
  // log the filtered teams for debugging purposes
  console.log(filteredTeams);
}
