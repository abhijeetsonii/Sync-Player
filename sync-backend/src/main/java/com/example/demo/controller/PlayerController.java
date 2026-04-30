package com.example.demo.controller;

import com.example.demo.model.PlayerAction;

import com.example.demo.model.ChatMessage;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.stereotype.Controller;

@Controller
public class PlayerController {
    @MessageMapping("/sync")
    @SendTo("/topic/room")
    public PlayerAction sync(PlayerAction action) {
        return action;
    }

    @MessageMapping("/chat")
    @SendTo("/topic/room")
    public ChatMessage handleChat(ChatMessage message) {
        System.out.println("Chat from " + message.getSender() + ": " + message.getContent());
        return message;
    }
}
