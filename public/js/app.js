const STORAGE_KEY = Object.freeze({
  USER_ID: "userId",
  USER_PASSWORD: "userPassword",
});

const socket = window.io();
const rtcPeerConnectionMap = new Map();

let id = "";
let nickname = "";
let myMediaStream;

function onReceiveChat(response) {
  const chatListContainer = document.getElementById("chat_list_container");
  const chatList = chatListContainer.querySelector(".chat-list");
  const chat = document.createElement("li");

  const chatNickname = document.createElement("strong");
  chatNickname.innerText = response.nickname;

  const contents = document.createElement("div");
  contents.innerText = response.msg;

  chat.appendChild(chatNickname);
  chat.appendChild(contents);
  chatList.insertAdjacentElement("afterbegin", chat);

  if (response.id === id) {
    chat.style.backgroundColor = "rgb(243, 243, 208)";
  }
}

async function makeMediaStream() {
  try {
    if (myMediaStream) {
      myMediaStream.getTracks().forEach((track) => track.stop());
    }

    myMediaStream = await window.navigator.mediaDevices.getUserMedia({
      audio: true,
      video: {
        facingMode: "user",
      },
    });

    myMediaStream.getVideoTracks().forEach((_track) => {
      const track = _track;
      track.enabled = document.getElementById("video_on_off_button").classList.contains("on");
    });

    myMediaStream.getAudioTracks().forEach((_track) => {
      const track = _track;
      track.enabled = document.getElementById("mic_on_off_button").classList.contains("on");
    });

    document.getElementById("my_video").srcObject = myMediaStream;
  } catch (e) {
    myMediaStream = null;
    console.trace(e);
  }
}

function createRTCPeerConnection(peerId, peerNickname) {
  const myRTCPeerConnection = new RTCPeerConnection({
    iceServers: [
      {
        urls: [
          "stun:stun1.l.google.com:19302",
          "stun:stun2.l.google.com:19302",
          "stun:stun3.l.google.com:19302",
          "stun:stun4.l.google.com:19302",
        ],
      },
    ],
  });

  if (myMediaStream) {
    myMediaStream.getTracks()
      .forEach((track) => myRTCPeerConnection.addTrack(track, myMediaStream));
  }

  const myPeerPlayerBorder = document.createElement("div");
  myPeerPlayerBorder.classList.add("peer-video-player-border", "video-player-border");
  myPeerPlayerBorder.dataset.peerId = peerId;

  const myPeerPlayer = document.createElement("video");
  myPeerPlayer.classList.add("peer-video-player", "video-player");
  myPeerPlayer.dataset.peerId = peerId;
  myPeerPlayer.autoplay = true;
  myPeerPlayer.playsinline = true;

  const myPeerPlayerCaption = document.createElement("div");
  myPeerPlayerCaption.classList.add("peer-video-player-caption", "video-player-caption");
  myPeerPlayerCaption.dataset.peerId = peerId;
  myPeerPlayerCaption.innerText = peerNickname;

  myPeerPlayerBorder.appendChild(myPeerPlayer);
  myPeerPlayerBorder.appendChild(myPeerPlayerCaption);

  myRTCPeerConnection.ontrack = (event) => {
    [myPeerPlayer.srcObject] = event.streams;
  };

  document.getElementById("video_player_container").appendChild(myPeerPlayerBorder);

  return myRTCPeerConnection;
}

function createDataChannel(_myRTCPeerConnection, isOffer) {
  const myRTCPeerConnection = _myRTCPeerConnection;
  const onChatDataChannelMessage = (event) => {
    onReceiveChat(JSON.parse(event.data));
  };

  if (isOffer) {
    myRTCPeerConnection.chatDataChannel = myRTCPeerConnection.createDataChannel("chat");
    myRTCPeerConnection.chatDataChannel.onmessage = onChatDataChannelMessage;
  } else {
    myRTCPeerConnection.ondatachannel = (event) => {
      myRTCPeerConnection.chatDataChannel = event.channel;
      myRTCPeerConnection.chatDataChannel.onmessage = onChatDataChannelMessage;
    };
  }
}

async function joinRoomCallback(response) {
  if (response.error) {
    window.alert(response.message);
    return;
  }

  document.getElementById("room_name_form_container").style.display = "none";
  document.getElementById("chat_desc").style.display = "none";
  document.getElementById("room_list_container").style.display = "none";
  document.getElementById("room_img_container").style.display = "none";
  
  document.getElementById("video_player_container").style.display = "";
  document.getElementById("chat_list_container").style.display = "";
  document.getElementById("chat_form_container").style.display = "";
  document.getElementById("chat_controller").style.display = "";

  const icon = document.createElement("i");
  icon.classList.add("ri-user-fill");

  const sizeOfRoom = document.createElement("span");
  sizeOfRoom.id = "size_of_room";
  sizeOfRoom.innerText = response.sizeOfRoom;

  const leaveButton = document.createElement("button");
  leaveButton.type = "button";
  leaveButton.classList.add("chat-room-leave-button");
  leaveButton.innerText = "Leave";

  document.getElementById("chat_title").innerText = `${response.chatRoom}`;

  const appTitleDiv = document.createElement("div");
  appTitleDiv.style.display = "flex";
  appTitleDiv.innerHTML = "&nbsp;(";
  appTitleDiv.appendChild(icon);
  appTitleDiv.appendChild(sizeOfRoom);
  appTitleDiv.appendChild(document.createTextNode(")"));

  document.getElementById("chat_title").appendChild(appTitleDiv);
  document.getElementById("chat_title").appendChild(leaveButton);

  document.querySelector("#chat_list_container .chat-list").innerHTML = "";
  document.querySelector("#chat_nickname_form .nickname-input").value = nickname;
  document.querySelector("#chat_submit_form .chat-submit-text-input").value = "";

  leaveButton.addEventListener("click", () => {
    rtcPeerConnectionMap.forEach((connection) => {
      document.querySelectorAll("#video_player_container .peer-video-player-border").forEach((peerFacePlayerBorder) => {
        peerFacePlayerBorder.remove();
      });
      connection.close();
    });
    rtcPeerConnectionMap.clear();

    if (myMediaStream) {
      myMediaStream.getTracks().forEach((track) => track.stop());
      myMediaStream = null;
    }

    socket.emit("leave-room", () => {
      document.getElementById("room_img_container").style.display = "";
      document.getElementById("room_name_form_container").style.display = "";
      document.getElementById("room_list_container").style.display = "";
      document.getElementById("chat_desc").style.display = "";
      document.getElementById("video_player_container").style.display = "none";
      document.getElementById("chat_list_container").style.display = "none";
      document.getElementById("chat_form_container").style.display = "none";
      document.getElementById("chat_controller").style.display = "none";
      document.getElementById("chat_title").innerText = "SJ's Room";
    });
  });
}

async function joinRoom(room) {
  if (room.trim()) {
    await makeMediaStream();
    socket.emit("join-room", room, joinRoomCallback);
  }
}

function refreshRooms(rooms) {
  const chatRoomListContainer = document.getElementById("room_list_container");
  chatRoomListContainer.innerHTML = "";

  rooms.forEach((room) => {
    const roomDiv = document.createElement("div");
    roomDiv.classList.add("room-enter-badge");
    roomDiv.innerText = room;

    roomDiv.addEventListener("click", async () => {
      await joinRoom(roomDiv.innerText);
    });

    chatRoomListContainer.appendChild(roomDiv);
  });
}

function initApplication() {
  const chatRoomForm = document.getElementById("room_form");
  const chatRoomTextInput = chatRoomForm.querySelector(".room-name-input");

  const nicknameForm = document.getElementById("chat_nickname_form");
  const nicknameTextInput = nicknameForm.querySelector(".nickname-input");

  const chatSubmitForm = document.getElementById("chat_submit_form");
  const chatSubmitTextInput = chatSubmitForm.querySelector(".chat-submit-text-input");

  chatRoomForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await joinRoom(chatRoomTextInput.value);
  });

  nicknameForm.addEventListener("submit", (event) => {
    event.preventDefault();
    socket.emit("change-nickname", nicknameTextInput.value, () => {
      nickname = nicknameTextInput.value;
    });
  });

  chatSubmitForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const chat = {
      id,
      nickname,
      msg: chatSubmitTextInput.value.trim(),
    };

    if (chat.msg) {
      rtcPeerConnectionMap.forEach((connection) => {
        if (connection.chatDataChannel) {
          connection.chatDataChannel.send(JSON.stringify(chat));
        }
      });

      onReceiveChat(chat);
      chatSubmitForm.reset();
    }
  });

  document.getElementById("video_on_off_button").addEventListener("click", (event) => {
    if (!myMediaStream || !myMediaStream.getVideoTracks().length) {
      return;
    }

    if (event.currentTarget.classList.contains("on")) {
      event.currentTarget.classList.remove("on");
      event.currentTarget.classList.remove("ri-camera-fill");
      event.currentTarget.classList.add("ri-camera-off-fill");
    } else {
      event.currentTarget.classList.add("on");
      event.currentTarget.classList.add("ri-camera-fill");
      event.currentTarget.classList.remove("ri-camera-off-fill");
    }

    myMediaStream.getVideoTracks().forEach((_track) => {
      const track = _track;
      track.enabled = event.currentTarget.classList.contains("on");
    });
  });

  document.getElementById("mic_on_off_button").addEventListener("click", (event) => {
    if (!myMediaStream || !myMediaStream.getAudioTracks().length) {
      return;
    }

    if (event.currentTarget.classList.contains("on")) {
      event.currentTarget.classList.remove("on");
      event.currentTarget.classList.remove("ri-mic-fill");
      event.currentTarget.classList.add("ri-mic-off-fill");
    } else {
      event.currentTarget.classList.add("on");
      event.currentTarget.classList.add("ri-mic-fill");
      event.currentTarget.classList.remove("ri-mic-off-fill");
    }

    myMediaStream.getAudioTracks().forEach((_track) => {
      const track = _track;
      track.enabled = event.currentTarget.classList.contains("on");
    });
  });

  socket.emit("login", window.sessionStorage.getItem(STORAGE_KEY.USER_ID), window.sessionStorage.getItem(STORAGE_KEY.USER_PASSWORD), (user) => {
    window.sessionStorage.setItem(STORAGE_KEY.USER_ID, user.id);
    window.sessionStorage.setItem(STORAGE_KEY.USER_PASSWORD, user.password);
    id = user.id;
    nickname = user.nickname;
  });

  socket.emit("get-rooms", refreshRooms);
}

socket.on("refresh-rooms", refreshRooms);

socket.on("notify-join-room", async (response) => {
  document.getElementById("size_of_room").innerText = response.sizeOfRoom;

  onReceiveChat({
    id: response.id,
    nickname: response.nickname,
    msg: "안녕하세용",
  });

  const myRTCPeerConnection = createRTCPeerConnection(response.id, response.nickname);
  myRTCPeerConnection.onicecandidate = (event) => {
    socket.emit("webrtc-ice-candidate", response.id, event.candidate);
  };
  createDataChannel(myRTCPeerConnection, true);
  rtcPeerConnectionMap.set(response.id, myRTCPeerConnection);

  const offer = await myRTCPeerConnection.createOffer();
  myRTCPeerConnection.setLocalDescription(offer);
  socket.emit("webrtc-offer", response.id, offer);
});

socket.on("notify-leave-room", (response) => {
  document.getElementById("size_of_room").innerText = response.sizeOfRoom;
  onReceiveChat({
    id: response.id,
    nickname: response.nickname,
    msg: "안녕히계세용",
  });

  if (rtcPeerConnectionMap.has(response.id)) {
    const peerFacePlayerBorder = document.querySelector(`#video_player_container .peer-video-player-border[data-peer-id="${response.id}"]`);

    if (peerFacePlayerBorder) {
      peerFacePlayerBorder.remove();
    }

    rtcPeerConnectionMap.get(response.id).close();
    rtcPeerConnectionMap.delete(response.id);
  }
});

socket.on("notify-change-nickname", (response) => {
  onReceiveChat({
    id: response.id,
    nickname: response.oldNickname,
    msg: `닉네임 변경 ==> ${response.nickname}`,
  });

  const peerFacePlayerCaption = document.querySelector(`.peer-video-player-caption[data-peer-id="${response.id}"]`);

  if (peerFacePlayerCaption) {
    peerFacePlayerCaption.innerText = response.nickname;
  }
});

socket.on("webrtc-offer", async (userId, userNickname, offer) => {
  const myRTCPeerConnection = createRTCPeerConnection(userId, userNickname);
  myRTCPeerConnection.onicecandidate = (event) => {
    socket.emit("webrtc-ice-candidate", userId, event.candidate);
  };
  createDataChannel(myRTCPeerConnection, false);
  rtcPeerConnectionMap.set(userId, myRTCPeerConnection);

  myRTCPeerConnection.setRemoteDescription(offer);
  const answer = await myRTCPeerConnection.createAnswer();
  myRTCPeerConnection.setLocalDescription(answer);
  socket.emit("webrtc-answer", userId, answer);
});

socket.on("webrtc-answer", (userId, userNickname, answer) => {
  if (!rtcPeerConnectionMap.has(userId)) {
    return;
  }

  rtcPeerConnectionMap.get(userId).setRemoteDescription(answer);
});

socket.on("webrtc-ice-candidate", (userId, candidate) => {
  if (rtcPeerConnectionMap.has(userId) && candidate) {
    rtcPeerConnectionMap.get(userId).addIceCandidate(candidate);
  }
});

initApplication();
