package com.example.demo.model;

public class PlayerAction {
    private String action;
    private double timestamp;

    public PlayerAction() {
    }

    public PlayerAction(String action, double timestamp) {
        this.action = action;
        this.timestamp = timestamp;
    }

    // Getters and setters are mandatory for private fields
    public String getAction() {
        return action;
    }
    public void setAction(String action) {
        this.action = action;
    }
    public double getTimestamp() {
        return timestamp;
    }
    public void setTimestamp(double timestamp) {
        this.timestamp = timestamp;
    }
}
