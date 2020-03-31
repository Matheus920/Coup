let app = require('express')();
let http = require('http').Server(app);
let io = require('socket.io')(http);
let players = [];
let deck = [];
let blockResponses = [];
let inAwait = null;
let room = "";

for(let i =0; i<20; i+=5){
    deck[i] = "Assassino"
    deck[i+1] = "Condessa"
    deck[i+2] = "Duque"
    deck[i+3] = "Embaixador"
    deck[i+4] = "Capitão"
}

function shuffle(array) {
    var currentIndex = array.length, temporaryValue, randomIndex;
  
    // While there remain elements to shuffle...
    while (0 !== currentIndex) {
  
      // Pick a remaining element...
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex -= 1;
  
      // And swap it with the current element.
      temporaryValue = array[currentIndex];
      array[currentIndex] = array[randomIndex];
      array[randomIndex] = temporaryValue;
    }
  
    return array;
}

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html')
});

http.listen(3000, () => {
    console.log('Listening on port *: 3000');
});

io.on('connection', (socket) => {
    socket.on('ajuda-externa', (data) => {
        io.sockets.to(room).emit('chat-message', {
            message: 'Solicitou ajuda externa',
            user: data.user
        });

        for(player of players){
            if(player.id == data.id)
                player.coins+= 1;
        }

        io.sockets.to(room).emit('joined', players);
    });
    socket.on('room', (data) => {
        room = data.room;
        socket.join(data.room);
    })
    socket.on('joined', (data) => {
        if(players.length == 0){
            deck = shuffle(deck);
        }

        data.cards = [deck.pop(), deck.pop()];

        players.push(data);
        socket.emit('deckChanges', data.cards);
        io.sockets.to(room).emit('joined', players);
    });
    socket.on('pegar2', (data) => {
        io.sockets.emit('chat-message', {
            message: 'Gostaria de pegar 2. O Duque pode efetuar o bloqueio.',
            user: data.user
        });

        socket.broadcast.to(room).emit('chanceDeBloqueio', {tipo: "Duque"})
        inAwait = {id: data.id, user: data.user, acao: 'pegar2'};

        //io.sockets.emit('joined', players);
    })
    socket.on('bloquear', (data) => {
        blockResponses.push(data)
            if(blockResponses.length-1 == io.sockets.adapter.rooms[room].length){
                let control = false;
                for(response of blockResponses){
                    console.log(response)
                    control = response.status;
                    if(control) break;
                }
                if(!control){
                    io.sockets.to(room).emit('chat-message', {
                        message: 'Não foi contestado.',
                        user: inAwait.user
                    });

                    if(data.acao == 'pegar2'){
                        for(player of players){
                            if(player.id == inAwait.id)
                                player.coins += 2
                        }
                    }
                    inAwait = {}
                    blockResponses = []
                    io.sockets.to(room).emit('joined', players);            
                }
            }
    })
});

