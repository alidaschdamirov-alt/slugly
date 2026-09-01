ALTER TABLE `pages`
  ADD COLUMN `renderMode` enum('builder','custom_html') NOT NULL DEFAULT 'builder' AFTER `buttonStyle`,
  ADD COLUMN `customHtml` text AFTER `renderMode`;