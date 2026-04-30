package com.example.demo.model;

public class ChatMessage {
    private String content;
    private String sender;


    public ChatMessage(){}
    public ChatMessage(String sender, String content){
        this.content = content;
        this.sender = sender;
    }

    //Getter and Setters
    public String getSender(){return sender;}
    public void setSender(String sender){this.sender = sender;}
    public String getContent(){return content;}
    public void setContent(String content){this.content = content;}

}
