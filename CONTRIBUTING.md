# Introduction

Thank you for considering contributing to Huskie Robotics' SPOT. Contributions from the community are greatly appreciated and will help to improve SPOT for everyone.

When contributing to this repository, please first discuss the change you wish to make via issue, email, or any other method with the owners of this repository before making a change.
Please note we have a [code of conduct](CODE_OF_CONDUCT.md), please follow it in all your interactions with the project.

Following these guidelines helps to communicate that you respect the time of the developers managing and developing this open source project. In return, we commit to  reciprocating  that respect in addressing your issue, assessing changes, and helping you finalize your pull requests.


# Ground Rules
## Responsibilities
* Ensure all changes are applicable to all users, not just your team.
* Ensure that code is thoroughly tested in all use cases.
* Document your code so that we, and anyone else, can understand it.
* Do not modify default configuration files. If you feel like your module or transformer could be added to the in-box pipeline config, please create an issue.

# Contributions

SPOT is an open source project and we love to receive contributions from our community — you! There are many ways to contribute, from writing tutorials or blog posts, improving the documentation, submitting bug reports and feature requests or writing code which can be incorporated into SPOT itself.

## Transformers and Modules
We'd love to see your analysis transformers and modules added to SPOT so that it can help the entire FIRST community! If you think your transformer and module could help the analysis process for other teams, please feel free to add it to the repository. We're willing to include almost any transformer or module as long as it follows the following guidelines:
* **Documented well** - Transformers can be hard to understand! Make sure they're well documented so that anyone can understand what's going on within the transformer code.
* **Stay in their own files** - Transformers and modules shouldn't need to modify the core SPOT code or any other modules, and should be limited to their specific file alone.
* **Limited in scope** - Transformers should NOT modify or delete existing paths in the dataset. They should only create new ones.
* **Stable** - Transformers and modules should not error if they are passed in the right data. Make sure to handle divide-by-zero errors and add default values, for example, to handle scenarios when  data is missing.
* **Configurable** - Transformers and modules should work with any input data as long as it's in the right format. They should also be highly configurable for a variety of use cases. For example, the `Stats` module can display stats with an optional `multiplier` and `addend` as well as a data `label` for each statistic.
* **Not too configurable** - Make sure to avoid putting too many options for your transformer or module. If you need to include a lot, make sure that they can be omitted from the configuration JSON and use default values instead, like the `Stats` module.
* **General Naming** - Try to avoid naming the transformer/module or internal variables after anything related to the game or any game terminology (ex. shot, score, climb). We are working with raw data, not game data. Words to use are "action, array, count" etc.
    * Instead of `ShotMap`, try `ActionMap`
    * Instead of `PickupList`, try `ActionList` (also goes along with **Configurable**)
* **Transformer Types**: Transformers should have either a `tmp` or `team` type, or both. Make sure your `team` type isn't just a version of another existing transformer like `average`.
* **Follow transformer/module required configurations** - Make sure to follow the general conventions and structure of existing transformers and modules.
    * Transformer configurations need:
        * `type` - Type of transformer, either `tmp` for Team Match Performances (one team's performance and actions in one match) or `team` (an entire team's data).
        * `name` - The name of the transformer file.
        * `outputPath` - Where the transformer outputs its data.
        * `options` - The options configuration object that your transformer takes in.
    * Module configurations need:
        * `view`: Which view the module will show up in (`team` or `match`).
        * `module`: The folder that the module is located in.
        * `position` (only for modules in the `team` view): The panel that the module shows in the `team` view. `main` for the larger left panel, `side` for the narrower right panel
        * `options` - The options configuration object that your module takes in.


# How to contribute
Before you decide to make a contribution to SPOT, please ensure that your contributions adhere to the Apache V2 [license](LICENSE) terms and do not violate any of the licensing terms followed by SPOT. Specifically, please ensure that your contributions do not include or link to any third party libraries that do not adhere to the Apache V2 license terms. 

1. Create your own fork of the code.
2. Make your changes in your fork.
3. If you like the change and think the project could use it:
    * Be sure you have followed the code style for the project.
    * Note the [SPOT Code of Conduct](CODE_OF_CONDUCT.md).
    * Send a pull request from your fork to the SPOT repository.

# Filing an issue
When filing an issue, make sure to answer these five questions:

1. What version of SPOT are you using (located in config.json)?
2. Where are you hosting SPOT?
3. What did you do? How can this issue be reproduced by others?
4. What did you expect to see?
5. What did you see instead?

# How to suggest a feature or enhancement
### Philosophy and guiding principles

* SPOT's goal is to provide a universal scouting app platform that can function with any past or future FIRST Robotics game by just changing the configuration.
* SPOT does not require you to write code to configure, set up, or use SPOT.
* SPOT does not require you to be online for its most basic features (scouting, data analysis)

# Code review process
The core team looks at pull requests on a regular basis in meetings and provides feedback on open pull requests and merges in valid pull requests.
After feedback has been given we expect that you will respond within two weeks. After two weeks we may close the pull request if it isn't showing any activity.

# Questions?
Message the core team at [spot@team3061.org](spot@team3061.org)
