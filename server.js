let app = require('express')();
let http = require('http').Server(app);
let io = require('socket.io')(http);
let players = [];
let deck = [];
let blockResponses = [];
let doubtResponses = [];
let inAwait = null;
let actionInAwait = null;
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
            message: 'Gostaria de pegar 2.',
            user: data.user
        });

        socket.broadcast.to(room).emit('chanceDeBloqueio', {tipo: "Duque", acao: 'pegar2'})
        inAwait = {id: data.id, user: data.user, acao: 'pegar2'};
    })
    socket.on('bloquear', (data) => {
        blockResponses.push(data)
            if(blockResponses.length == players.length-1){
                let control;
                for(response of blockResponses){
                    control = response
                    if(control.status) break;
                }
                if(!control.status){
                    io.sockets.to(room).emit('chat-message', {
                        message: 'Não foi contestado.',
                        user: inAwait.user
                    });

                    if(data.acao == 'pegar2'){
                        for(player of players){
                            if(player.id == inAwait.id)
                                player.coins += 2
                        }
                        inAwait = {}
                    }
                    if(data.acao == 'roubar2'){
                        io.sockets.to(room).emit('declaracaoInfluencia', {
                            user: inAwait.user,
                            id: inAwait.id,
                            tipo: ['Capitão']
                        })
                        actionInAwait = inAwait
                    }
                    blockResponses = []
                    io.sockets.to(room).emit('joined', players);            
                }else {
                    if(data.acao == 'pegar2'){
                        io.sockets.to(room).emit('chat-message', {
                            message: 'O jogador declara ser o Duque e quer bloquear seu movimento.',
                            user: control.user
                        })

                        io.sockets.to(room).emit('declaracaoInfluencia', {
                            user: control.user,
                            id: control.id,
                            tipo: ['Duque']
                        })
                        inAwait = control
                        blockResponses = []
                    }
                    else if(data.acao == 'roubar2'){
                        io.sockets.to(room).emit('chat-message', {
                            message: 'O jogador declara ser o Capitão/Embaixador e quer bloquear seu movimento.',
                            user: control.user
                        })

                        io.sockets.to(room).emit('declaracaoInfluencia', {
                            user: control.user,
                            id: control.id,
                            tipo: ["Capitão", "Embaixador"]
                        })
                        control.acao = "blockRoubo"
                        actionInAwait = inAwait
                        actionInAwait.acao = "blockRoubo"
                        inAwait = control
                        blockResponses = []
                    }
                }
            }
    })

    socket.on('duvidar', (data) => {
        doubtResponses.push(data);
        if(doubtResponses.length == players.length-1){
            let control;
            for(doubt of doubtResponses){
                control = doubt;
                if(control.status) break;
            }
            if(!control.status){
                if(actionInAwait.acao == 'duque3'){
                    for(player of players){
                        if(player.id == actionInAwait.id){
                            player.coins += 3;
                        }
                    }
                }

                if(actionInAwait.acao == 'roubar2'){
                    for(player of players){
                        if(player.id == actionInAwait.id){
                            player.coins += 2;
                        }
                        if(player.id == actionInAwait.idPlayer){
                            player.coins -= 2;
                        }
                    }
                }

                io.sockets.to(room).emit('chat-message', {
                    message: 'Não foi contestado.',
                    user: actionInAwait.user
                });

                io.sockets.to(room).emit('joined', players);
                inAwait = {}
                actionInAwait = {}

            } else {
                io.sockets.to(room).emit('chat-message', {
                    message: 'O jogador duvida da sua informação.',
                    user: control.user
                });

                io.sockets.to(room).emit('provar', {
                    user: inAwait.user,
                    id: inAwait.id,
                    tipo: control.tipo
                })

                inAwait = control

            }
            doubtResponses = []
        }
    })
    socket.on('provaCorreta', (data) => {
        let newCards = []
        for(player of players){
            if(player.id == data.id){
                player.cards[data.cardIndex] = deck.pop()
                newCards = player.cards
            }
        }
        socket.emit('deckChanges', newCards);

        io.sockets.to(room).emit('chat-message', {
            message: 'Não estava mentindo.',
            user: data.user
        });

        if(actionInAwait.acao == 'duque3'){
            for(player of players){
                if(player.id == actionInAwait.id){
                    player.coins += 3;
                }
            }
        }

        if(actionInAwait.acao == 'roubar2'){
            for(player of players){
                if(player.id == actionInAwait.id){
                    player.coins += 2;
                }
                if(player.id == actionInAwait.idPlayer){
                    player.coins -= 2;
                }
            }
        }

        io.sockets.to(room).emit('joined', players)

        io.sockets.to(room).emit('descartarCard', {
            id: inAwait.id
        })
        
        inAwait = {}
        actionInAwait = {}
    })
    socket.on('realizarDescarte', (data) => {
        let newCards = []
        let oldCard = []
        for(player of players){
            if(player.id == data.id){
                oldCard = player.cards.splice(data.cardIndex, 1)
                newCards = player.cards
            }
        }

        socket.emit('deckChanges', newCards);
        io.sockets.to(room).emit('chat-message', {
            message: 'Realizou o descarte de ' + oldCard[0],
            user: data.user
        });
    })
    socket.on('duque3', (data) => {
        io.sockets.emit('chat-message', {
            message: 'O jogador declara ser Duque e quer pegar 3.',
            user: data.user
        });

        socket.broadcast.to(room).emit('declaracaoInfluencia',
         {
            tipo: "Duque", 
            user: data.user,
            id: data.id,
        });

        actionInAwait = {id: data.id, user: data.user, acao: 'duque3'};
        inAwait = {id: data.id, user: data.user, acao: 'duque3'};
    })
    socket.on('roubar2', (data) => {
        io.sockets.emit('chat-message', {
            message: 'O jogador declara ser Capitão e quer roubar de ' + data.player.username,
            user: data.user
        });

        socket.broadcast.to(room).emit('chanceDeBloqueio', {tipo: "Capitão/Embaixador", acao: 'roubar2'})
        inAwait = {id: data.id, user: data.user, acao: 'roubar2', idPlayer: data.player.id};
    })
});

