


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

    // function getCSS(element)
    // {
    //     var css_data = '';
    //     var css_obj = getComputedStyle(element);

    //     for(var i = 0; i < css_obj.length;i++)
    //     {
    //         css_data +=
    //             css_obj[i] + ':' + 
    //             css_obj.getPropertyValue(css_obj[i])

    //     }
    // }
    
    

    // if (authRequest.status !== 2) {
    //     const authModal = new Modal("small", false).header("Sign In")
    //     const accessCodeInput = createDOMElement("input", "access-input")
    //     accessCodeInput.placeholder = "Access Code"
    //     accessCodeInput.type = "password"
    //     accessCodeInput.addEventListener("keydown", (e) => {
    //         if (e.keyCode == 13) {
    //             validate(accessCodeInput.value, authModal)
    //         }
    //     })
    //     authModal.element.appendChild(accessCodeInput)
    //     authModal.action("Submit", async () => {
    //         validate(accessCodeInput.value, authModal)
    //     })
    // } else {
    //     await constructApp()
    // }

    // async function validate(accessCode, authModal) {
    //     const auth = await fetch("./api/auth", {
    //         headers: {
    //             Authorization: accessCode
    //         }
    //     }).then(res => res.json())

    //     if (auth.status === 1) {
    //         await constructApp(accessCode)
    //         authModal.modalExit()
    //     } else {
    //         new Popup("error", "Wrong Access Code")
    //     }
    // }
})()

async function constructApp() {

    updateMatches(matches)

    //document.querySelector("#match-list").classList.add("visible")

    // setInterval(() => updateMatches(accessCode), 2500);

    // document.querySelector("#start-scouting").addEventListener("click", () => {
    //     fetch("/admin/api/enterMatch", {
    //         headers: {
    //             Authorization: accessCode
    //         }
    //     });
    //     console.log("ENTER MATCH!")
    // })

    // let menuExpanded = false

    // document.querySelector("#admin-panel").classList.add("visible")
    // document.querySelector("#menu").classList.add("visible")

    // document.querySelector("#menu-icon").addEventListener("click", () => {
    //     if (menuExpanded) {
    //         document.querySelector("#menu").classList.remove("expanded")
    //     } else {
    //         document.querySelector("#menu").classList.add("expanded")
    //     }
    //     menuExpanded = !menuExpanded
    // })
}


async function updateMatches(matchNumber) {
    // let {allMatches, currentMatch} = await (await fetch(`/admin/api/matches`, {
    //     headers: {
    //         Authorization: "1234"
    //     }
    // })).json();

    //let {allMatches, currentMatch} = fetch("/admin/api/matches");
    //let {allMatches, currentMatch} = matches; / broken
    
    //let allMatches;
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

                let allianceElement = document.getElementsByClassName(`match-teams qm${i}`);
                for(element of allianceElement)
                {
                    let element = document.getElementsByClassName('match-team')
                    for(team of element)
                    {
                        team.setAttribute("contentEditable", false);
                    }
                }
            
                
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

//         function lockTable()
//         {
//             if(!checkbox.checked)
//         }
//   //matchElement.add('contentEditable="false"');
    
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