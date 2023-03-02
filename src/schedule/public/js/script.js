
let processedMatches = [];

;(async () => {
    // const authRequest = await fetch("./api/auth").then(res => res.json())

    constructApp();

    let matches = 0;
    let numMatchesInput = document.querySelector("#numMatches");
    numMatchesInput.addEventListener("keydown", function (e){
        if(e.keyCode == 13) {
            matches = numMatchesInput.value
            console.log(matches);
            updateMatches(matches);
            //FormData.clear;
        }
    })

})()

async function constructApp() {

    updateMatches(matches)
    

}



async function updateMatches(matchNumber) {

    //makes a place to store data
    for(let i=0; i<matchNumber; i++){
        processedMatches.push(null);
    }

    document.querySelector("#match-list").innerHTML = "";
    for(let i=1; i<=matchNumber; i++)
    {
        //   <input type="image" src="./img/lock_closed.png" class="lock-img">
        let matchElement = document.createElement("div") // test 
        document.querySelector("#match-list").appendChild(matchElement);
        matchElement.classList.add("match"); // Add a button to add name intead of "manual" on table 
        matchElement.innerHTML = `
        <div class="match-header"><strong>${i}</strong> - ${"MANUAL"}-<strong>${"QM" + i}</strong></div> 
        <input type="checkbox" class="match-select">
 
        <div class="match-teams red qm${i}">
        <div class="match-team r1-${i}" contentEditable="true"></div>
        <div class="match-team r2-${i}" contentEditable="true"></div>
        <div class="match-team r3-${i}" contentEditable="true"></div>
        </div>
        <div class="match-teams blue qm${i}">
        <div class="match-team b1-${i}" contentEditable="true"></div>
        <div class="match-team b2-${i}" contentEditable="true"></div>
        <div class="match-team b3-${i}" contentEditable="true"></div>
        </div>
        `

        // make a way to distruguishing between divs (with ids like qm1 etc)
        let checkbox = matchElement.querySelector(".match-select")
        checkbox.addEventListener("input", () => {
            console.log(checkbox.checked)
            if (checkbox.checked) { //if its already selected, do nothing
                //disable editable inputs


                // array
                // let redteams = [];

                let allianceElement = document.getElementsByClassName(`match-teams qm${i}`);
                for(element of allianceElement)
                {
                    let element = document.getElementsByClassName('match-team')
                    for(team of element)
                    {
                        team.setAttribute("contentEditable", false);
                        
                        // let red1 = document.getElementsByClassName(`match-teams r1-${i}`).value;

                        // redteams.push(red1);
                    }
                }

                // scrape data and add to array (unformatted)
                // console.log(redteams);

            
                
            } else {
                //enable editable inputs
                let allianceElement = document.getElementsByClassName(`match-teams qm${i}`);
                for(element of allianceElement)
                {
                    let element = document.getElementsByClassName('match-team')
                    for(team of element)
                    {
                        team.setAttribute("contentEditable", true);
                    }
                }
            }
        
        
        })
       

    }


    
}






// // not sure if this will work but building a [] of matches in the proper format
// let processedMatches = [];

// //add the level offset to each match and simplify structure
// for (let match of tbaMatches) {
//     processedMatches.push({
//         number: match.match_number + levelOffsets[match.comp_level], //adjust match number with the offset
//         match_string: match.key,
//         robots: {
//             red: match.alliances.red.team_keys.map(x=>x.replace("frc","")),
//             blue: match.alliances.blue.team_keys.map(x=>x.replace("frc",""))
//         }
//     });
// }
