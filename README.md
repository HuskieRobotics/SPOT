# SPOT
SPOT (Scouting Platforms On Time) is an open source modular scouting app framework developed by Team 3061 Huskie Robotics. SPOT provides a simple platform upon which a team can build a scouting app with little to no prior experience.

SPOT is built with HTML, JS, CSS, and Node.js and operates with a MongoDB database.

## SPOT Is Teams Who...
1. Teams that are new to scouting and aren't sure what information to gather or how to analyze their data. SPOT comes as a preconfigured app that can be deployed with minimal setup and will provide all the basic functionality needed by most teams.
2. Teams that have some experience with scouting and wants to collect specific data that may not be part of the default configuration but that doesn't have significant programming experience. SPOT can be configured by modifying configuration files rather than by writing code.
3. Teams that have experience with scouting and wants to perform custom analysis operations or advanced custom scouting interfaces and has some programming experience. SPOT can utilize user-provided analysis modules to extend its functionary beyond the default configuration without requiring teams to modify the base code. 
4. Teams that have significant experience with scouting and significant programming expertise. SPOT is open source, document, and designed to extensible such that teams can start from this code base and build their own custom scouting system.


## Features
- An intuitive customizable interface for building your scouting app adaptable to any FRC game.
- Easy to use platform for data entry throughout matches.
- Analysis page to display statistics and charts about matches and teams.
- Admin view for live scouter management at competition.
- Easy scouter tracking and analytics through Google authentication or a form.

## [Quickstart Guide](https://docs.google.com/document/d/1dATXMC5U7aT0SfnYEOWFiafaeWbu8opabNglWSFCSPE/view)

## Pages
Pages are the modular component of the scouting frontend. Every view that a scouter sees is a page. Pages are stored in `/src/scouting/views/pages/` as .ejs files. By default, the initial page is `landing.ejs`, but can be changed in `/src/scouting/scouting.js`.

JS and CSS files for these pages can be found in `/src/scouting/public/css/` or `/src/scouting/public/js/`. Make sure to include your JS and CSS files inside your page individually. 


### Page JS Best Practices
`/src/scouting/public/js/internal.js` contains JS functions or code that will be included in every page. 

Minimize your use of  global functions and variables. These should only be used if a function or variable is shared between multiple pages.


### Page CSS Best Practices

`/src/scouting/public/css/global.css` contains global CSS variables and styles that will be available to use in all pages.

`/src/scouting/public/css/internal.css` contains CSS styles integral to the proper functioning of the app.

When selecting elements in your page-specific CSS files, make sure to begin your selector with `#[pagename]` where `[pagename]` is your page's name.

(ex: `#landing .action` to select elements with the `action` class in the `landing.ejs` page)

### Page JS Utilities

Use the function `switchPage` in pages (located in `internal.js`) to switch pages.
