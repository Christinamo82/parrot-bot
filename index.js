// 'use strict'

// const express = require('express')
// const bodyParser = require('body-parser')
// const request = require('request')
// const app = express()

// app.set('port', (process.env.PORT || 5000))

// // Process application/x-www-form-urlencoded
// app.use(bodyParser.urlencoded({extended: false}))

// // Process application/json
// app.use(bodyParser.json())

// // Index route
// app.get('/', function (req, res) {
//     res.send('Hello world, I am a chat bot')
// })

// // for Facebook verification
// app.get('/webhook/', function (req, res) {
//     if (req.query['hub.verify_token'] === 'my_voice_is_my_password_verify_me') {
//         res.send(req.query['hub.challenge'])
//     }
//     res.send('Error, wrong token')
// })

// // Spin up the server
// app.listen(app.get('port'), function() {
//     console.log('running on port', app.get('port'))
// })

// app.post('/webhook/', function (req, res) {
//     let messaging_events = req.body.entry[0].messaging
//     for (let i = 0; i < messaging_events.length; i++) {
//         let event = req.body.entry[0].messaging[i]
//         let sender = event.sender.id
//         if (event.message && event.message.text) {
//             let text = event.message.text
//             sendTextMessage(sender, "Text received, echo: " + text.substring(0, 200))
//         }
//     }
//     res.sendStatus(200)
// })

// const token = process.env.FB_PAGE_ACCESS_TOKEN

// function sendTextMessage(sender, text) {
//     let messageData = { text:text }
//     request({
//         url: 'https://graph.facebook.com/v2.6/me/messages',
//         qs: {access_token:token},
//         method: 'POST',
//         json: {
//             recipient: {id:sender},
//             message: messageData,
//         }
//     }, function(error, response, body) {
//         if (error) {
//             console.log('Error sending messages: ', error)
//         } else if (response.body.error) {
//             console.log('Error: ', response.body.error)
//         }
//     })
// }

'use strict'

const express = require('express')
const bodyParser = require('body-parser')
const request = require('request')
const fs = require('fs')
const app = express()

//
//all wizards
const wizards = []

//current user-wizard pairs
const userWizardPairs = {}

//user waitinglist queue
function UserQueue() {
    this.queue = [];
}

UserQueue.prototype.push = function(item){return this.queue.push(item);}
UserQueue.prototype.pop = function(){return this.queue.shift();}
UserQueue.prototype.empty = function(){return this.queue.length === 0;}
UserQueue.prototype.find = function(item){return this.queue.indexOf(item);}

const userQueue = new UserQueue();


//setting port
app.set('port', (process.env.PORT || 5000))

// Process application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({extended: false}))

// Process application/json
app.use(bodyParser.json())

// Index route
app.get('/', function (req, res) {
    res.send('Hello world, I am a chat bot')
})

// for Facebook verification
app.get('/webhook/', function (req, res) {
    if (req.query['hub.verify_token'] === 'my_voice_is_my_password_verify_me') {
        res.send(req.query['hub.challenge'])
    }
    res.send('Error, wrong token')
})

// Spin up the server
app.listen(app.get('port'), function() {
    console.log('running on port', app.get('port'))
})


app.post('/webhook/', function (req, res) {
    let messaging_events = req.body.entry[0].messaging
    for (let i = 0; i < messaging_events.length; i++) {
      let event = req.body.entry[0].messaging[i]
      let sender = event.sender.id

      //check if the event is a message
      let text = "";
      if (event.message && event.message.text) {
          text = event.message.text
      }

      //if sender is paired up
      if(userWizardPairs[sender]){
          let fileName = sender+".txt";
          let label = "u";
          if(isWizard(sender,wizards)) { //the sender is a wizard
            fileName  = userWizardPairs[sender]+".txt";
            label = "w";
          }

          // clear conversation if it is over
          if(isWizard(sender,wizards) && event.message && event.message.text){
              var wizardText = event.message.text;
              if(checkForText("STOP",wizardText)){
                  sendGoodbye(userWizardPairs[sender]) // say goodbye to user (so they know convo is over)
                  clearPair(sender, userWizardPairs[sender]);
                  checkWaitingUsers(userQueue,wizards,sender,text);
              }
            }

          writeTextToFile(fileName, text, label);
          directBackAndForth(userWizardPairs[sender],  text);

      } else { //sender is not paired up
          if(isWizard(sender,wizards)){//sender is a wizard
              if (req.body.entry[0].messaging[i].postback) { //if wizard click the button
                text = event.postback.payload
                let userid = parseInt(text)
                // console.log(userid)
                if(userWizardPairs[userid]){  //if the user has already been claimed by other wizard
                    cancelRequest(sender, userid);
                } else {
                    createPair(sender, parseInt(userid));
                    sendWelcomeMessage(parseInt(userid));
                }

              } else if (checkForText("wizardLeave",text)){ //wizard wants to leave
                let wizard = sender;
                removeWizard(wizard,wizards);
                directBackAndForth(wizard, "Thanks for helping! You're logged off now");
              } else {
                // directBackAndForth(sender, "To stop being a wizard, type wizardLeave");
                //if wizard sending a message, not taken
                console.log("Wizards cannot initiate a conversation");
              }

          } else if(checkForText("wizardRequest",text)){ //sender is currently a user, but wants to be a wizard
              let wizard = sender;
              wizards.push(wizard);
              directBackAndForth(wizard, "Congrats! You are now a wizard");
              //check for waiting users
              checkWaitingUsers(userQueue,wizards,wizard,text);
              console.log("no user available for pair up");
          } else { //sender is a user, ask all available wizards
              // future work: add a check for whether it's working hours (9-5 CST)
              if(userQueue.empty()){ //if no one is waiting in front of the user, check availability of wizards
                  let findAvailableWizard = false;
                  for (let wizard of wizards){
                      if(!userWizardPairs[wizard]){ // wizard is available
                          startWizards(wizard, sender, text.substring(0, 200));
                          findAvailableWizard = true;
                      }
                  }
                  if(!findAvailableWizard){
                      userNeedToWait(sender);
                  }
              } else { //if someone is waiting, simply push
                  userNeedToWait(sender);
              }
          }
      }
    }
    res.sendStatus(200)
})

const token = process.env.FB_PAGE_ACCESS_TOKEN

function checkForText(seekText,fullText) {
  if(fullText.indexOf(seekText) != -1){
    return true;
  } else {
    return false;
  }
}


function isWizard(user,wizards) {
  if (wizards.length > 0) { // first there have to be at least some wizards
    if(wizards.indexOf(user) != -1) {
        return true;
    } else {
        return false;
    }
  } else { // if there are no wizards, this person is automatically not a wizard
        return false;
  }
}

function removeWizard(wizard,wizards){
  var index = wizards.indexOf(wizard);
  if (index > -1) {
      wizards.splice(index, 1);
  }
}

function checkWaitingUsers(userQueue,wizards,wizard,text) {
  while(!userQueue.empty()){
    let user = userQueue.pop();
    if(!isWizard(user,wizards)){ //the current user in the user queue is not a wizard
      startWizards(wizard, user, text.substring(0, 200));
      break;
    }
  }
}

//test
function writeTextToFile(fileName, text, label){
  let logDir = './logs';
  if(!fs.existsSync(logDir)){
    fs.mkdirSync(logDir);
    if(!fs.existsSync(logDir)){
      console.log("creat directory failed");
    }
  }

  let directory =`${logDir}/${fileName}`;
  let fulltext = `${label}: ${text}\n`;
  fs.appendFile(directory, fulltext , function(err){
    if (err) throw err;

    console.log("writeTextToFile", directory, ",text: ", fs.readFileSync(directory, 'utf8'));
  });
}

//creating pair betwene wizard and user
function sendGoodbye(user) {
    directBackAndForth(user, "Bye!");
}

//creating pair betwene wizard and user
function createPair(wizard,user) {
    console.info("createPair");
    userWizardPairs[wizard] = user
    userWizardPairs[user] = wizard
    sendTextMessage(wizard, "paired up with "+user);
}

// remove the pair between wizard and user
function clearPair(wizard, user){
    delete userWizardPairs[wizard];
    delete userWizardPairs[user];
}

function userNeedToWait (user){
    let waitingListNum = userQueue.find(user);
    let text = "";
    if(waitingListNum !== -1){ //if already in the user queue
       waitingListNum = waitingListNum + 1;
       text = `Sorry, I'm still working--but you are #${waitingListNum} in line`;
    } else { // check if someone is waiting in the queue
      text = "Sorry, I can't take your request right now--but you're first in line.";
      waitingListNum = userQueue.push(user) -1;
      if(waitingListNum != 0){ // if the user is not the first in the queue
        text = `Sorry, I cant take your request right now. There are ${waitingListNum} people in front of you`;
      }
    }

    console.log("userNeedToWait", userQueue.queue);
    directBackAndForth(user, text);
}




//send user request to wizard
function startWizards(wizard, sender, text) {
    console.log("startWizards");
     //let messageData = { text: sender + "writes: " + text}
    let messageData = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "button",
                "text": text,
                "buttons": [{
                    "type": "postback",
                    "title": "Claim",
                    "payload": sender
                }]
            }
        }
    }

    //let messageData = { text: sender + " writes: " + text}
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token:token},
        method: 'POST',
        json: {
            recipient: {id:wizard},
            message: messageData,
        }
    }, function(error, response, body) {
        if (error) {
            console.log('Error sending messages: ', error)
        } else if (response.body.error) {
            console.log('Error: ', response.body.error)
        }
    })
}

//creating pair betwene wizard and user
function createPair(wizard,user) {
    console.info("createPair");
    userWizardPairs[wizard] = user
    userWizardPairs[user] = wizard
    directBackAndForth(wizard, "paired up with "+user);
}

//tell wizard the user request is canceled
function cancelRequest(wizard, user){
    console.log("cancelRequest");
    let messageData = {text: user+" is already paired up"}

    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token:token},
        method: 'POST',
        json: {
            recipient: {id:wizard},
            message: messageData,
        }
    }, function(error, response, body) {
        if (error) {
            console.log('Error sending messages: ', error)
        } else if (response.body.error) {
            console.log('Error: ', response.body.error)
        }
    })
}



function directBackAndForth(messageRecipient, text) {
    console.log("direct talk to each other");
    let messageData = { text:text}

    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token:token},
        method: 'POST',
        json: {
            recipient: {id:messageRecipient},
            message: messageData,
        }
    }, function(error, response, body) {
        if (error) {
            console.log('Error sending messages: ', error)
        } else if (response.body.error) {
            console.log('Error: ', response.body.error)
        }
    })
}

 //sending welcome message to user when they are paired up with wizard
function sendWelcomeMessage(sender) {
    let messageData = {text: "Hi! How can I help you?"}
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token:token},
        method: 'POST',
        json: {
            recipient: {id:sender},
            message: messageData,
        }
    }, function(error, response, body) {
        if (error) {
            console.log('Error sending messages: ', error)
        } else if (response.body.error) {
            console.log('Error: ', response.body.error)
        }
    })
}