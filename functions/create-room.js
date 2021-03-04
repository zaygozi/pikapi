// P2P requirements
const wrtc = require('wrtc');
const fetch = require('node-fetch');
const WebSocket = require('ws');
const SimplePeerJs = require('simple-peerjs');

const {
    prompt
} = require('enquirer');
const CryptoJS = require('crypto-js');
const boxen = require('boxen');
const moment = require('moment');
const term = require('terminal-kit').terminal;
const cliCursor = require('cli-cursor');
const gradient = require('gradient-string');
const emoji = require('node-emoji');

// room variables
let room = null; // room name is also the host peer id
let alias = null;
let members = [];
// Message queue
let queue = [];
// Message archive
let archive = [];
// Last ids are used to detect lost messages by the peers
let last_id = 0;
let passkey = null;
let verified = false;
let enc = null;
let currentInput = null;

// Clear archive every 5 minutes
setInterval(() => {
    archive = [];
}, 300000);

function createRoom() {
    let questions = [{
            type: 'input',
            name: 'room',
            message: 'Room'
        },
        {
            type: 'password',
            name: 'passkey',
            message: 'Passkey',
            validate: (input) => {
                let value = input.trim();
                return value.length >= 8;
            }
        },
        {
            type: 'select',
            name: 'enc',
            message: 'Encryption',
            choices: ['AES', 'RABBIT']
        },
        {
            type: 'input',
            name: 'alias',
            message: 'Alias'
        }
    ];
    prompt(questions).then((answers) => {
        room = answers.room;
        passkey = answers.passkey;
        enc = answers.enc;
        alias = answers.alias.toLowerCase();
        members.push(alias); // adding host to members as well
        // Initializing host peer
        const peer = new SimplePeerJs({
            id: room,
            wrtc,
            fetch,
            WebSocket,
            host: 'peerchat-broker-1.herokuapp.com',
            port: 443,
            path: '/',
            secure: true,
            iceTransportPolicy: 'relay',
            reconnectTimer: 3000,
            config: {
                iceServers: [
                    {
                        urls: 'stun:numb.viagenie.ca',
                        credential: 'Pikapo@123',
                        username: 'pikapo@pokemail.net'
                    },
                    {
                        urls: 'stun:global.stun.twilio.com:3478?transport=udp'
                    },
                    {
                        urls: 'stun:stun.l.google.com:19302'
                    },
                    {
                        urls: 'turn:numb.viagenie.ca',
                        credential: 'Pikapo@123',
                        username: 'pikapo@pokemail.net'
                    }
                ]
            }
        });
        // Preparing console
        peer.id.then((id) => {
            console.log(`Creating room : ${id}`);
            console.log('Preparing console....');
            console.clear();
            console.log(boxen(gradient.pastel(`Room : ${id}\nEncryption : ${enc}`), {
                padding: 1,
                margin: 1,
                borderStyle: 'singleDouble',
                align: 'center',
                float: 'center',
                borderColor: 'yellowBright'
            }));
            takeInput();
            // Leave a bot message to fill the loneliness if there are no other members in 30s
            setTimeout(() => {
                if (members.length < 2) {
                    currentInput.hide();
                    term.bold.brightYellow(`[${moment().format('HH:mm')}] (madbot) [PM] `);
                    term.bold.brightYellow(`Seems lonely in here. Invite some people and I'll tell you once they are here!`);
                    takeInput();
                }
            }, 30000);
        }, (err) => {
            console.error(err);
        });
        // Handling incoming connections
        peer.on('connect', (conn) => {
            let peer_alias = null;

            // Handling incoming messages
            conn.peer.on('data', async (load) => {
                let data = JSON.parse(load);
                peer_alias = data.alias;
                // Handling peer authentication
                if (data.type === 'auth') {
                    if (data.passkey === passkey) {
                        // Avoid duplicate alias
                        if (members.includes(peer_alias)) {
                            peer_alias = null;
                            let payload = {
                                type: 'auth-error',
                                msg: 'Alias has already been claimed by another member in the room!'
                            };
                            return conn.peer.send(JSON.stringify(payload));
                        }
                        verified = true;
                        members.push(peer_alias);
                        let payload = {
                            type: 'conf',
                            enc: enc,
                            last_id: last_id
                        };
                        await conn.peer.send(JSON.stringify(payload));
                        let bot_msg = {
                            type: 'msg',
                            from: 'bot',
                            msg: `${peer_alias} has joined`,
                            alias: 'madbot'
                        };
                        await conn.peer.send(JSON.stringify(bot_msg));
                        currentInput.hide();
                        term.bold.brightYellow(`[${moment().format('HH:mm')}] (${bot_msg.alias}) `);
                        term.bold.brightYellow(bot_msg.msg);
                        return takeInput();
                    } else {
                        let payload = {
                            type: 'auth-error',
                            msg: 'Wrong passkey!'
                        };
                        await conn.peer.send(JSON.stringify(payload));
                        currentInput.hide();
                        term.bold.brightYellow(`[${moment().format('HH:mm')}] (madbot) [PM] `);
                        term.bold.brightYellow(`${peer_alias} has been denied access (wrong passkey)`);
                        takeInput();
                    }
                }
                // Handling resend requests
                else if (data.type === 'req') {
                    if (!verified) {
                        let payload = {
                            type: 'auth-error',
                            msg: 'Authentication required!'
                        };
                        return conn.peer.send(JSON.stringify(payload));
                    }
                    let req = data.req;
                    archive.forEach((record) => {
                        if (record.id === req && members.length > 1) {
                            conn.peer.send(JSON.stringify(record));
                        }
                    });
                } else {
                    if (!verified) {
                        let payload = {
                            type: 'auth-error',
                            msg: 'Authentication required!'
                        };
                        return conn.peer.send(JSON.stringify(payload));
                    }
                    // Send all incoming msgs to queue after attaching a id
                    data.id = last_id + 1;
                    queue.push(data);
                    last_id += 1;

                    // Querying queue and sending out the stored messages (first in first out)
                    setInterval(async () => {
                        if (queue.length !== 0 && members.length > 1) {
                            await conn.peer.send(JSON.stringify(queue[0]));
                            let temp = queue[0];
                            archive.push(queue.shift());
                            // Decrypt and print peer messages
                            if (temp.from !== room) {
                                let decrypted = null;
                                if (enc === 'AES') {
                                    let bytes = CryptoJS.AES.decrypt(temp.msg, passkey);
                                    decrypted = bytes.toString(CryptoJS.enc.Utf8);
                                } else {
                                    let bytes = CryptoJS.Rabbit.decrypt(temp.msg, passkey);
                                    decrypted = bytes.toString(CryptoJS.enc.Utf8);
                                }
                                currentInput.hide();
                                term.bold.brightGreen(`[${moment().utc().format('HH:mm')}] (${temp.alias}) `);
                                term.bold.brightGreen(emoji.emojify(decrypted));
                                takeInput();
                            }
                        }
                    }, 100);
                }
            });

            // Handling peer disconnect
            conn.peer.on('close', () => {
                if (members.includes(peer_alias) && peer_alias !== alias) {
                    members.splice(members.indexOf(peer_alias), 1);
                }
                conn.peer.destroy();
                if (peer_alias !== null && verified) {
                    let bot_msg = {
                        type: 'msg',
                        from: 'bot',
                        msg: `${peer_alias} left`,
                        alias: 'madbot'
                    };
                    currentInput.hide();
                    term.bold.brightYellow(`[${moment().format('HH:mm')}] (${bot_msg.alias}) `);
                    term.bold.brightYellow(bot_msg.msg);
                    takeInput();
                    // check if room still has any members left
                    setTimeout(() => {
                        if (members.length > 1) {
                            conn.peer.send(JSON.stringify(bot_msg));
                        } else {
                            currentInput.hide();
                            term.bold.brightYellow(`[${moment().format('HH:mm')}] (madbot) [PM] `);
                            term.bold.brightYellow('No members left in the room!');
                            takeInput();
                        }
                    }, 1000);
                }
            });

        });

        // Handling error
        peer.on('error', (err) => {
            if (err.code === 'ERR_CONNECTION_FAILURE') {
                console.log('Unable to establish connection with remote peer!');
            } else if (err.code === 'ERR_WEBRTC_SUPPORT') {
                console.log('Webrtc error!');
            } else if (err.code === 'ERR_SIGNALING') {
                console.log('Signaling server error!');
            } else if (err.type === 'unavailable-id') {
                console.log('Room name is currently in use!');
                term('\n');
                return createRoom();
            } else {
                console.log(err);
            }
        });

    }, (err) => {
        // when cli crashes or ctrl+c is used
        term('\n');
        process.exit();
    });
}

// Handles user input
function takeInput() {
    if (!currentInput) {
        term('\n\n');
        cliCursor.show();
        currentInput = term.inputField((err, message) => {
            if (err) throw err;
            let encrypted = null;
            if (message.trim() === 'exit') {
                term('\n\n');
                console.clear();
                process.exit();
            } else if (message.trim() === 'members') {
                currentInput.hide();
                term.bold.brightYellow(`[${moment().format('HH:mm')}] (madbot) `);
                term.bold.brightYellow(`Room currently has ${members.length} members : ${members.join('  ')}`);
                currentInput = null;
                takeInput();
            } else if (message.trim().length === 0) {
                // Dont send blank space
            } else {
                if (enc === 'AES') {
                    encrypted = CryptoJS.AES.encrypt(message.trim(), passkey).toString();
                } else {
                    encrypted = CryptoJS.Rabbit.encrypt(message.trim(), passkey).toString();
                }
                let payload = {
                    type: 'msg',
                    from: room,
                    msg: encrypted,
                    alias: alias,
                    id: last_id + 1
                };
                queue.push(payload);
                last_id += 1;
                currentInput = null;
                takeInput();
            }
        });
    } else {
        term('\n\n');
        currentInput.rebase();
        cliCursor.show();
    }
}

module.exports = {
    createRoom
};