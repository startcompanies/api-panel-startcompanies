import { Category } from "../../categories/entities/category.entity";
import { Tag } from "../../tags/entities/tag.entity";
import { User } from "../../../shared/user/entities/user.entity";
import { Column, CreateDateColumn, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, PrimaryGeneratedColumn } from "typeorm";

@Entity('posts')
export class Post {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    title: string;

    @Column({ unique: true })
    slug: string;

    @Column('text')
    content: string;

    @Column('text')
    excerpt: string;

    @Column({ nullable: true })
    image_url: string;

    @Column({ default: true })
    is_published: boolean;

    @Column({ default: false })
    sandbox: boolean;

    @CreateDateColumn({ type: 'timestamp'})
    published_at: Date

    // Relación Many-To-One con User (un post tiene solo un autor)
    @ManyToOne(() => User, (user) => user.posts, {onDelete: 'CASCADE'})
    @JoinColumn({name: 'user_id'})
    user: User;

    // Relación Many-to-Many con Category (un post puede tener varias categorías)
    @ManyToMany(() => Category)
    @JoinTable({
        name: 'post_categories',
        joinColumn: {name: 'post_id', referencedColumnName: 'id'},
        inverseJoinColumn: { name: 'category_id', referencedColumnName: 'id'}
    })
    categories: Category[];

    // Relación Many-to-Many con Tag (un post puede tener varios tags)
    @ManyToMany(() => Tag)
    @JoinTable({
        name: 'post_tags',
        joinColumn: {name: 'post_id', referencedColumnName: 'id'},
        inverseJoinColumn: {name: 'tag_id', referencedColumnName: 'id'}
    })
    tags: Tag[];
}