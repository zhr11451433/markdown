package database

import (
	"time"

	"gorm.io/gorm"
)

type Note struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
	Title     string         `gorm:"type:varchar(50)" json:"title"`
	Content   string         `gorm:"type:text" json:"content"`
}

func AutoMigrate(db *gorm.DB) error {
	return db.AutoMigrate(
		&Note{},
	)
}
