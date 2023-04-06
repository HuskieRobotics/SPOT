// matches array 
let processedMatches = [];
// authentication 
;(async () => {
    const authRequest = await fetch("./api/auth").then(res => res.json())

    if (authRequest.status !== 2) {
        const authModal = new Modal("small", false).header("Sign In")
        const accessCodeInput = createDOMElement("input", "access-input")
        accessCodeInput.placeholder = "Access Code"
        accessCodeInput.type = "password"
        accessCodeInput.addEventListener("keydown", (e) => {
            if (e.keyCode == 13) {
                validate(accessCodeInput.value, authModal)
            }
        })
        authModal.element.appendChild(accessCodeInput)
        authModal.action("Submit", async () => {
            validate(accessCodeInput.value, authModal)
        })
    } else {
        await constructApp()
    }

    async function validate(accessCode, authModal) {
        const auth = await fetch("./api/auth", {
            headers: {
                Authorization: accessCode
            }
        }).then(res => res.json())

        if (auth.status === 1) {
            await constructApp(accessCode)
            authModal.modalExit()
        } else {
            new Popup("error", "Wrong Access Code")
        }
    }


    // number of matches input; after enter is clicked make match schedule
    var matches = 0;


   let numMatchesInput = document.querySelector("#numMatches");
    numMatchesInput.addEventListener("keydown", function (e){
        if(e.keyCode == 13) {
            matches = numMatchesInput.value
            console.log(matches);
            makeMatchSchedule(matches);
            updateMatches(matches);
         
        }
    })

})()

// construct app 
async function constructApp() {

    
    updateMatches(matches);
    

}



async function updateMatches(matchNumber) {

    //makes a place to store data
    for(let i=0; i<matchNumber; i++){
        processedMatches.push(null);
    }

    document.querySelector("#match-list").innerHTML = "";
    for(let i=1; i<=matchNumber; i++)
    {
        let matchElement = document.createElement("div") 
        document.querySelector("#match-list").appendChild(matchElement);
        matchElement.classList.add("match"); 
        matchElement.innerHTML = `
        <div class="match-header"><strong>${i}</strong> - ${"MANUAL"}-<strong>${"QM" + i}</strong></div> 
        <input type="checkbox" class="match-select" id="${i}">
 
        <div class="match-teams red qm${i}">
        <div class="match-team m${i}" contentEditable="true" tm="r1"></div>
        <div class="match-team m${i}" contentEditable="true" tm="r2"></div>
        <div class="match-team m${i}" contentEditable="true" tm="r3"></div>
        </div>
        <div class="match-teams blue qm${i}">
        <div class="match-team m${i}" contentEditable="true" tm="b1"></div>
        <div class="match-team m${i}" contentEditable="true" tm="b2"></div>
        <div class="match-team m${i}" contentEditable="true" tm="b3"></div>
        </div>
        `

        let checkbox = matchElement.querySelector(".match-select")
        checkbox.addEventListener("input", () => {
            console.log(checkbox.checked)
            if (checkbox.checked) { //if its already selected, do nothing
                //disable editable inputs

                let element = document.getElementsByClassName(`m${i}`);
                for(team of element)
                {
                    team.setAttribute("contentEditable", false);
                }
                let totalTeams = getTeams("m"+checkbox.id)
                processTeams(checkbox.id, totalTeams);
    
             
                
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

function getTeams(num) {

    let teamArray = document.getElementsByClassName(num);
    let processedArray = []; 
    for(value of teamArray)
    {
        processedArray.push(value.innerHTML);
    }

    // returns team data for match selected in an array of 6 strings 
    return processedArray;
}

var processedManualMatches = [];
// make an array which will get filled in tba format

function makeMatchSchedule(matchTotalNum){
    // creates a blank form with the correct number of matches
    processedManualMatches = [];

        // tba formatted data 
    for (let i=1; i<=matchTotalNum; i++) {
        processedManualMatches.push({
            number: i, 
            match_string: `2023temp_q${i}`, // use temp bc we don't need event keys and don't have one
            robots: {
                red: [null, null, null], // empty arrays to get filled 
                blue: [null, null, null],
            }
        });
    }
}


async function processTeams(matchNum, teams) {
    // inserts data into the correct spot
    let data = await teams;
    console.log(data);
    let redTeams = [];
    let blueTeams = [];
    for(let i = 0; i < 3; i++)
    {
        redTeams.push(data[i]);
        blueTeams.push(data[i+3]);
    }

    // acccess the correct match object and then adding to properties
    processedManualMatches[matchNum-1].robots.red = redTeams; 
    processedManualMatches[matchNum-1].robots.blue = blueTeams;

        // post request to send schedule to admin 
    console.log(processedManualMatches);
    console.log(JSON.stringify(processedManualMatches)) 
    fetch('/schedule/matches',{
        method:"POST",
        headers: {
            "Content-Type": "application/json",
        },
        body:JSON.stringify(processedManualMatches)
    }).catch(e=>console.log(e))

}

async function getManualMatches() {
    return processedManualMatches;

}




