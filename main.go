package main

import (
	"fmt"
	"log"
	"markdown/backend/config"
	"markdown/backend/database"
	"markdown/backend/router"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(".env文件加载失败")
	}
	db, err := database.LinkMySQL(cfg)
	if err != nil {
		log.Fatalf("连接 MySQL 失败: %v", err)
	}
	fmt.Println("连接MySQL成功")
	err = database.AutoMigrate(db)
	if err != nil {
		log.Fatal("数据库迁移失败: ", err)
	}
	r := router.NewRouter(db)
	_ = r.Run(":8080")
}
