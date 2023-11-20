package main

import (
	"bufio"
	"fmt"
	"math/rand"
	"os"
	"time"
)

const (
	numRecords   = 1000000
	productsFile = "one_million_products.csv"
)

func main() {
	file, err := os.Create(productsFile)
	if err != nil {
		panic(err)
	}
	defer file.Close()

	writer := bufio.NewWriter(file)
	defer writer.Flush()

	// Write the header
	_, err = writer.WriteString("name,sku,description,price,last_updated\n")
	if err != nil {
		panic(err)
	}

	// Generate and write each record
	for i := 0; i < numRecords; i++ {
		record := generateRecord()
		_, err = writer.WriteString(record)
		if err != nil {
			panic(err)
		}
	}
}

func generateRecord() string {
	name := generateName()
	sku := generateSKU()
	description := generateDescription()
	price := generatePrice()
	lastUpdated := generateLastUpdated()

	return fmt.Sprintf("%s,%s,%s,$%.2f,%s\n", name, sku, description, price, lastUpdated)
}

func generateName() string {
	names := []string{"Pro", "Lite", "Ultra", "Super", "Eco", "Mini"}
	devices := []string{"System", "Device", "Controller", "Machine"}

	return names[rand.Intn(len(names))] + " " + devices[rand.Intn(len(devices))]
}

func generateSKU() string {
	letters := "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
	numbers := "0123456789"

	sku := "SKU-"
	for i := 0; i < 4; i++ {
		sku += string(letters[rand.Intn(len(letters))])
	}
	sku += "-"
	for i := 0; i < 3; i++ {
		sku += string(numbers[rand.Intn(len(numbers))])
	}

	return sku
}

func generateDescription() string {
	verbs := []string{"monetize", "iterate", "facilitate", "whiteboard", "productize", "orchestrate", "deliver", "disintermediate", "streamline"}
	adjectives := []string{"user-centric", "customized", "plug-and-play", "cross-media", "turn-key", "open-source", "vertical", "extensible", "real-time"}
	nouns := []string{"markets", "models", "technologies", "content", "platforms", "deliverables", "mindshare", "infrastructures", "methodologies"}

	return fmt.Sprintf("This is a %s %s %s product with features.", verbs[rand.Intn(len(verbs))], adjectives[rand.Intn(len(adjectives))], nouns[rand.Intn(len(nouns))])
}

func generatePrice() float64 {
	return rand.Float64()*900 + 100 // Random price between 100 and 1000
}

func generateLastUpdated() string {
	startDate := time.Date(2023, 9, 1, 0, 0, 0, 0, time.UTC)
	endDate := time.Date(2023, 10, 31, 0, 0, 0, 0, time.UTC)
	randomTime := rand.Int63n(endDate.Unix()-startDate.Unix()) + startDate.Unix()

	return time.Unix(randomTime, 0).Format("2006-01-02 15:04:05")
}

func init() {
	rand.Seed(time.Now().UnixNano())
}
