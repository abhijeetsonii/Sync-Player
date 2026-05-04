package com.example.demo.model;

public class PlayerAction {
    private String action;
    private String sender;
    private double timestamp;

    public PlayerAction() {
    }

    public PlayerAction(String action, String sender, double timestamp) {
        this.action = action;
        this.sender = sender;
        this.timestamp = timestamp;
    }

    // Getters and setters are mandatory for private fields
    public String getAction() {
        return action;
    }
    public void setAction(String action) {
        this.action = action;
    }
    public String getSender() {
        return sender;
    }
    public void setSender(String sender) {
        this.sender = sender;
    }
    public double getTimestamp() {
        return timestamp;
    }
    public void setTimestamp(double timestamp) {
        this.timestamp = timestamp;
    }
}
