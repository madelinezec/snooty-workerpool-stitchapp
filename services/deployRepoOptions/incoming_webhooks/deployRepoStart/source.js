exports = async function(payload, response) {

  // verify slack auth
  var slackAuth = context.functions.execute("validateSlackAPICall", payload);
  if (!slackAuth || slackAuth.status !== 'success') {
    return slackAuth;
  }
  
  console.log('----- BEGIN JOB FROM SLACK ------');
  
  // https://api.slack.com/interactivity/handling#payloads
  var parsed = JSON.parse(payload.query.payload);
  var stateValues = parsed.view.state.values;
  

  // get repo options for this user from slack and send over
  var entitlement = await context.functions.execute("getUserEntitlements", {
    'query': {
      'user_id': parsed.user.id
    }
  });
  if (!entitlement || entitlement.status !== 'success') {
    return 'ERROR: you are not entitled to deploy any docs repos';
  }
  
  console.log('user deploying job', JSON.stringify(entitlement));
  
  // mapping of block id -> input id
  var values = {};
  var inputMapping = {
    'block_repo_option': 'repo_option',
    'block_hash_option': 'hash_option',
  };
  
  // get key and values to figure out what user wants to deploy
  for (var blockKey in inputMapping) {
    var blockInputKey = inputMapping[blockKey];
    var stateValuesObj = stateValues[blockKey][blockInputKey];
    // selected value from dropdown
    if (stateValuesObj && stateValuesObj.selected_option && stateValuesObj.selected_option.value) {
      values[blockInputKey] = stateValuesObj.selected_option.value;
    } 
    // multi select is an array
    else if (stateValuesObj && stateValuesObj.selected_options && stateValuesObj.selected_options.length > 0) {
      values[blockInputKey] = stateValuesObj.selected_options;
    }
    // input value
    else if (stateValuesObj && stateValuesObj.value) {
      values[blockInputKey] = stateValuesObj.value;
    } 
    // no input
    else {
      values[blockInputKey] = null;
    }
  }
  
  
  for (let i = 0; i < values.repo_option.length; i++) {
    // // e.g. mongodb/docs-realm/master => (site/repo/branch)
    var thisRepo = values.repo_option[i].value;
    var buildDetails = thisRepo.split('/');
    try {
      let jobTitle     = 'Slack deploy: ' + entitlement.github_username;
      let jobUserName  = entitlement.github_username;
      let jobUserEmail = entitlement.email ? entitlement.email : 'split@nothing.com';
      let isPrivate = (buildDetails[0] === '10gen') ? true : false;
      const newPayload = {
        jobType:    "productionDeploy",
        source:     "github", 
        action:     "push", 
        repoName:   buildDetails[1], 
        branchName: buildDetails[2],
        isFork:     true, 
        private:    isPrivate,
        isXlarge:   true,
        repoOwner:  buildDetails[0],
        url:        'https://github.com/' + buildDetails[0] + '/' + buildDetails[1],
        newHead:    values.hash_option ? values.hash_option : null,
      }; 
      
      context.functions.execute("addJobToQueue", newPayload, jobTitle, jobUserName, jobUserEmail);  
    } catch(err) {
      console.log(err);
    }
  }
  
  // respond to modal
  response.setHeader("Content-Type", "application/json");
  response.setStatusCode(200);
    
};