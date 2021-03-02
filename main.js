#!/usr/bin/env node
const {program} = require('commander');
const updateNotifier = require('update-notifier');
const pkg = require('./package.json');
program.version(`${pkg.version} (Kiera) [Beta]`);

// Function imports
const {createRoom} = require('./functions/create-room');
const {joinRoom} = require('./functions/join-room');

// Notify user about new updates
const notifier = updateNotifier({pkg});
notifier.notify({isGlobal: true});

// ---------------- Commands -----------------

// Open chatroom
program
    .command("host")
    .description("Host a chatroom")
    .action(() => {
        createRoom();
    })

// Join chatroom
program
    .command("connect")
    .description("Join a chatroom")
    .action(() => {
        joinRoom();
    })

program.parse(process.argv);