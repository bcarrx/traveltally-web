/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package yentracker.model;

/**
 *
 * @author bubac
 */
public class Query {
   
    private double cost;
    private double usd;
    private int choice;
    
    public Query(double cost, double usd, int choice){
        this.cost = cost;
        this.usd = usd;
        this.choice = choice;
         
    }
    public double getCost() {
            return cost;
    
}
    public double getUsd() {
            return usd;
        }
    public int getChoice() {
            return choice;
        }
}
